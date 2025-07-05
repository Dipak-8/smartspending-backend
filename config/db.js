import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const con = await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB:${con.connection.host}`);
  } catch (error) {
    console.log("Error connecting to MongoDB", error);
  }
};
export default connectDB;