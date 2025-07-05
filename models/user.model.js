
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      // We'll make this optional since OAuth users won't have a password
      required: function() {
        // Only required if there's no OAuth provider
        return !this.googleId && !this.facebookId;
      },
      minlength: 6,
    },
    googleId: {
      type: String,
    },
    facebookId: {
      type: String,
    },
    profilePicture: {
      type: String,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;