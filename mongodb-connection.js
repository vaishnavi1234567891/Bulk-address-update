const mongoose = require("mongoose")

// MongoDB connection setup
const connectDB = async () => {
  const conn = await mongoose.connect(
    "mongodb+srv://shubhamkmr06082001:jl6RXqidtv3Eg1ET@database.mk1kzpb.mongodb.net/bulk-update-legacy",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  console.log(`MongoDB connected : ${conn.connection.host}`)
}

module.exports = connectDB
