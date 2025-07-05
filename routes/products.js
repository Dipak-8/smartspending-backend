import express from 'express';
import Product from '../models/Product.js'


const router = express.Router();


router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving products', error: err });
  }
});

export default router
