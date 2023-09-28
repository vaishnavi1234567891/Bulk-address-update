const express = require("express")
const mongoose = require("mongoose")
const multer = require("multer")
const csv = require("csv-parser")
const fs = require("fs")
const { Readable } = require("stream")
const AWS = require("aws-sdk")
const serverless = require("serverless-http")
const connectDB = require("./mongodb-connection")
const app = express()
const port = 3000

AWS.config.update({
  accessKeyId: "AKIA2KOPSPMVZOJH5MUU",
  secretAccessKey: "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",
  region: "us-east-1",
})

connectDB()

// Create a mongoose model for addresses
const Address = mongoose.model("Address", {
  name: String,
  street: String,
  city: String,
  state: String,
  zip: String,
})

const s3 = new AWS.S3()
const sqs = new AWS.SQS()
const s3BucketName = "legacy-bucket-2309"
const sqsQueueUrl =
  "https://sqs.us-east-1.amazonaws.com/709641796395/legacy-queue-2309"

// Set up Multer for file upload
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
})

// Middleware to parse JSON requests
app.use(express.json())

// SCENARIO 2 -> FILE UPLOAD
app.post(
  "/api/bulk-update-and-cache",
  upload.single("file"),
  async (req, res) => {
    const fileBuffer = req.file.buffer
    const addresses = []
    await Address.deleteMany({})
    const readableStream = new Readable()
    readableStream.push(fileBuffer)
    readableStream.push(null)

    readableStream
      .pipe(csv())
      .on("data", (row) => {
        const address = new Address({
          name: row.name,
          street: row.street,
          city: row.city,
          state: row.state,
          zip: row.zip,
        })
        addresses.push(address)
      })
      .on("end", async () => {
        try {
          await Address.insertMany(addresses)

          // Store data in S3
          const data = addresses
          const s3Params = {
            Bucket: s3BucketName,
            Key: "bulk-addresses.json",
            Body: JSON.stringify(data),
          }
          await s3.putObject(s3Params).promise()

          // Send data to SQS
          const sqsParams = {
            MessageBody: JSON.stringify(data),
            QueueUrl: sqsQueueUrl,
          }
          await sqs.sendMessage(sqsParams).promise()

          res
            .status(201)
            .json({ message: "Bulk address update and caching complete" })
        } catch (error) {
          console.error("Error during bulk address update:", error)
          res.status(500).json({ error: "Error during bulk address update" })
        }
      })
  }
)

// SCENARIO 2 -> TEXTBOX
app.post("/api/update-address", async (req, res) => {
  try {
    const data = req.body
    let addresses

    // Clear all existing data from the MongoDB collection
    await Address.deleteMany({})

    if (Array.isArray(data)) {
      addresses = data.map((addressData) => new Address(addressData))
      await Address.insertMany(addresses)
    } else {
      addresses = new Address(data)
      await address.save()
    }

    // Store data in S3
    const s3Params = {
      Bucket: s3BucketName,
      Key: "bulk-addresses.json",
      Body: JSON.stringify(addresses),
    }
    await s3.putObject(s3Params).promise()

    // Send data to SQS
    const sqsParams = {
      MessageBody: JSON.stringify(addresses),
      QueueUrl: sqsQueueUrl,
    }
    await sqs.sendMessage(sqsParams).promise()

    res.status(201).json({ message: "Address updated successfully" })
  } catch (error) {
    console.error("Error during address update:", error)
    res.status(500).json({ error: "Error during address update" })
  }
})

// SCENARIO 1
app.get("/api/mongo-addresses", async (req, res) => {
  try {
    const addresses = await Address.find()
    res.json({ addresses, source: "MongoDB" })
  } catch (error) {
    console.error("Error during address retrieval:", error)
    res.status(500).json({ error: `Error during address retrieval` })
  }
})

app.get("/api/cached-addresses", async (req, res) => {
  res.status(404).json({ message: "Cached data not found" })
})

// SCENARIO 3
app.get("/api/clear-all-cached-data", (req, res) => {
  res.status(200).json({ message: "Working on it ..." })
})

// Function to delete all message from sqs
async function deleteAllMessages() {
  try {
    // Receive and delete messages until the queue is empty
    while (true) {
      const receiveParams = {
        QueueUrl: sqsQueueUrl,
        MaxNumberOfMessages: 10, // Adjust this as needed
        WaitTimeSeconds: 5, // Adjust this as needed
      }

      const response = await sqs.receiveMessage(receiveParams).promise()

      if (response.Messages && response.Messages.length > 0) {
        const deleteParams = {
          QueueUrl: sqsQueueUrl,
          ReceiptHandle: response.Messages[0].ReceiptHandle,
        }
        await sqs.deleteMessage(deleteParams).promise()
      } else {
        break
      }
    }
    console.log("All messages deleted from the queue.")
  } catch (error) {
    console.error("Error deleting messages from the queue:", error)
  }
}

// SCENARIO 4
app.get("/api/clear-all-mongodb-data", async (req, res) => {
  try {
    // await Address.deleteMany({})

    // DELEte data from s3 and sqs
    const s3Params = {
      Bucket: s3BucketName,
      Key: "bulk-addresses.json",
    }

    s3.deleteObject(s3Params, (err, data) => {
      if (err) {
        console.error("Error deleting object from S3:", err)
      } else {
        console.log("Object deleted from S3:", data)
      }
    })
    await deleteAllMessages()
  } catch (error) {
    console.error("Error clearing all MongoDB data:", error)
    res.status(500).json({ message: "Error clearing all MongoDB data" })
  }
})

// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`)
// })

module.exports.handler = serverless(app)
