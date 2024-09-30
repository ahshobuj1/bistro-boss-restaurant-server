const express = require('express');
const app = express();
const cors = require('cors');
const Stripe = require('stripe');
require('dotenv').config();
var jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const {MongoClient, ServerApiVersion, ObjectId} = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@ecommercedatabase.la5qrjd.mongodb.net/?retryWrites=true&w=majority&appName=ecommerceDatabase`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const menuCollection = client.db('bistroBoss').collection('menu');
        const reviewCollection = client.db('bistroBoss').collection('reviews');
        const cartCollection = client.db('bistroBoss').collection('carts');
        const userCollection = client.db('bistroBoss').collection('users');
        const paymentCollection = client
            .db('bistroBoss')
            .collection('payments');

        // middlewares
        const verifyToken = (req, res, next) => {
            const token = req.headers.authentication.split(' ')[1];
            console.log(token);
            if (!token) {
                return res.status(401).send({message: 'unauthorized access'});
            }

            jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
                if (err) {
                    return res
                        .status(401)
                        .send({message: 'unauthorized access'});
                }
                req.decoded = decoded;
                next();
            });
        };

        // Use VerifyAdmin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            console.log('Admin verify', req.decoded.email);
            const query = {email: email};
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({message: 'forbidden access'});
            }
            next();
        };

        // JWT Token
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
                expiresIn: '1h',
            });
            res.send({token});
        });

        // Make user Admin
        app.patch('/users', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const updatedDoc = {
                $set: {
                    role: 'admin',
                },
            };
            const result = await userCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Users Related API

        app.get('/users/admin', verifyToken, async (req, res) => {
            const email = req.query.email;
            //console.log('user admin ', req.decoded.email);
            if (!email === req.decoded.email) {
                return res.status(403).send({message: 'forbidden access'});
            }
            const query = {email: email};
            const checkUserAdmin = await userCollection.findOne(query);
            let admin = false;
            if (checkUserAdmin) {
                admin = checkUserAdmin.role === 'admin';
            }
            res.send({admin});
        });

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = {email: user.email};
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({message: 'user already exists'});
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.delete('/users', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        // Menu Related API
        app.get('/menu', async (req, res) => {
            const sort = {date: -1};
            const result = await menuCollection.find().sort(sort).toArray();
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await menuCollection.findOne(query);
            res.send(result);
        });

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menuItem = req.body;
            const result = await menuCollection.insertOne(menuItem);
            res.send(result);
        });

        app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const item = req.body;
            const query = {_id: new ObjectId(id)};
            const updatedItem = {
                $set: {
                    name: item.name,
                    price: parseFloat(item.price),
                    category: item.category,
                    recipe: item.recipe,
                },
            };
            const result = await menuCollection.updateOne(query, updatedItem);
            res.send(result);
        });

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        });

        // Review Related API
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        });

        // Cart Related API
        app.get('/carts', async (req, res) => {
            const email = req?.query?.email;
            const query = {email: email};
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/carts', verifyToken, async (req, res) => {
            const cartsData = req.body;
            const result = await cartCollection.insertOne(cartsData);
            res.send(result);
        });

        app.delete('/carts/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // Payment Intent - //Payment Related API
        app.post('/create-payment-intent', async (req, res) => {
            const {price} = req.body;
            const amount = parseInt(price * 100);
            // Create a paymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            });
            res.send({clientSecret: paymentIntent.client_secret});
        });

        app.get('/payments', async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const sort = {date: -1};
            const result = await paymentCollection
                .find(query)
                .sort(sort)
                .toArray();
            res.send(result);
        });

        app.post('/payments', verifyToken, async (req, res) => {
            const paymentHistory = req.body;
            const paymentResult = await paymentCollection.insertOne(
                paymentHistory
            );
            console.log(paymentHistory);
            const query = {
                _id: {
                    $in: paymentHistory.ids.map((id) => new ObjectId(id)),
                },
            };

            console.log('deleted query id : ', query);

            const cartResult = await cartCollection.deleteMany(query);
            res.send({paymentResult, cartResult});
        });

        // Admin Stats
        app.get('/admin-stats', async (req, res) => {
            const products = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            const users = await userCollection.estimatedDocumentCount();

            // Aggregate pipeline for all revenue
            const payments = await paymentCollection
                .aggregate([
                    {
                        $group: {
                            _id: null,
                            totalRevenue: {$sum: '$price'},
                        },
                    },
                ])
                .toArray();

            const revenue = payments[0]?.totalRevenue || 0;

            res.send({products, orders, users, revenue});
        });

        // Admin order stats ( Aggregate Pipeline ) - category, length and price - for charts
        app.get('/order-stats', async (req, res) => {
            const orderStats = await paymentCollection
                .aggregate([
                    // Unwind the cartIds array to process each menuId individually
                    {
                        $unwind: '$cartIds',
                    },

                    // Convert cartId to ObjectId
                    {
                        $addFields: {
                            cartToObjectId: {$toObjectId: '$cartIds'},
                        },
                    },

                    // Lookup to join with the menuCollection based on _id
                    {
                        $lookup: {
                            from: 'menu',
                            localField: 'cartToObjectId',
                            foreignField: '_id',
                            as: 'menuDetailIds',
                        },
                    },

                    // Unwind the menuDetails array (there should only be one element per menuId)
                    {
                        $unwind: '$menuDetailIds',
                    },

                    // Group by category to get total price for each category
                    {
                        $group: {
                            _id: '$menuDetailIds.category',
                            count: {$sum: 1},
                            revenue: {$sum: '$menuDetailIds.price'},
                        },
                    },

                    // Project the needed fields: price and category
                    {
                        $project: {
                            _id: 0,
                            category: '$_id',
                            count: 1,
                            revenue: 1,
                        },
                    },
                ])
                .toArray();

            res.send(orderStats);
        });

        // Send a ping to confirm a successful connection
        await client.db('admin').command({ping: 1});
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!'
        );
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('hello bistro boss server');
});

app.listen(port, () => {
    console.log(`server is running via: http://localhost:${port}`);
});
