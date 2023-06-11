const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// jwt 
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    // bearer token
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
    })
}


// connet mongodb

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lvuf5o9.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // collections
        const classesCollection = client.db('cinematicArtsDB').collection('classes');
        const selectedClassesCollection = client.db('cinematicArtsDB').collection('selectedClasses');
        const usersCollection = client.db('cinematicArtsDB').collection('users');
        const paymentCollection = client.db('cinematicArtsDB').collection('payments');

        // sent jwt token
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h',
            })
            res.send({ token })
        })

        // verify admin jwt
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        // get all classes data sorted by number of students
        app.get('/all-classes', async (req, res) => {
            const result = await classesCollection.find().sort({ numOfStudent: -1 }).toArray();
            res.send(result);
        });


        // create user data api
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        // get all user
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        // change user role
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const reqRole = req.query.role;
            // console.log(email, reqRole);
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    role: reqRole
                },
            };
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })

        // post selected classes [users endpoint]
        app.post('/selected-classes', async (req, res) => {
            const selectedClasse = req.body;
            const result = await selectedClassesCollection.insertOne(selectedClasse);
            res.send(result);
        })

        // seats update
        app.get('/all-classes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classesCollection.findOne(query)
            res.send(result)
        })
        app.patch('/update-class-seats/:id', async (req, res) => {
            const id = req.params.id;
            const updateSeats = req.body;
            const filter = { _id: new ObjectId(id) };
            // console.log(updateToys)
            const updateDoc = {
                $set: {
                    ...updateSeats
                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // get selected classes [users endpoint]
        app.get('/selected-classes', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }

            const query = { email: email }
            const result = await selectedClassesCollection.find(query).toArray();
            res.send(result);
        })

        // delete from selected classes [users endpoint]
        app.delete('/selected-classes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassesCollection.deleteOne(query)
            res.send(result);
        })
        // get for payment from selected classes [users endpoint]
        app.get('/selected-class/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassesCollection.findOne(query)
            res.send(result);
        })

        // Get user enrolled courses
        app.get('/users-enrolled', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            const query = { email: email };
            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
            res.send(result);
        });

        // get student
        app.get('/users/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email };
            const userStudent = await usersCollection.findOne(query);
            const result = { student: userStudent?.role === 'student' };
            res.send(result);
        })


        // Get user
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await usersCollection.findOne(query)
            res.send(result)
        })

        // get admin
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email };
            const userAdmin = await usersCollection.findOne(query);
            const result = { admin: userAdmin?.role === 'admin' };
            res.send(result);
        })

        // get all instructors for admin
        app.get('/manage-class-status', verifyJWT, async (req, res) => {
            const result = await classesCollection.find({ classStatus: { $exists: true } }).toArray();
            res.send(result)
        })
        // update from admin, instructor class status
        app.patch('/update/:id', async (req, res) => {
            const id = req.params.id;
            const updateStatus = req.body;
            const filter = { _id: new ObjectId(id) };
            // console.log(updateToys)
            const updateDoc = {
                $set: {
                    ...updateStatus
                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        // update feedback

        app.patch('/feedback/:id', async (req, res) => {
            const id = req.params.id;
            const { feedback } = req.body;
            const updateStatus = req.body;
            const filter = { _id: new ObjectId(id) };
            // console.log(updateToys)
            const updateDoc = {
                $set: {
                    ...updateStatus
                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // get instructor
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email };
            const userInstructor = await usersCollection.findOne(query);
            const result = { instructor: userInstructor?.role === 'instructor' }
            res.send(result);
        })

        // instructor insert class
        app.post('/instructor-post-class', async (req, res) => {
            const body = req.body;
            const result = await classesCollection.insertOne(body);
            res.send(result);
        })

        // get instructor classes 
        app.get('/my-inserted-classes', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }
            const query = { email: email }
            const result = await classesCollection.find(query).toArray();
            res.send(result);
        })

        // create payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related api
        app.post('/payments/:selectedClassID', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);

            const selectedClassID = req.params.selectedClassID
            const query = { _id: new ObjectId(selectedClassID) }
            const deleteResult = await selectedClassesCollection.deleteOne(query)

            // console.log(query);
            res.send({ insertResult, deleteResult });
        })
        // update from admin, instructor class status
        // app.patch('/update-seats/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const updateStatus = req.body;
        //     const filter = { _id: new ObjectId(id) };
        //     // console.log(updateToys)
        //     const updateDoc = {
        //         $set: {
        //             ...updateStatus
        //         }
        //     }
        //     const result = await classesCollection.updateOne(filter, updateDoc);
        //     res.send(result);
        // })
        // find single class form seats update
        app.get('/find-paid-class/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await classesCollection.findOne(query);
            res.send(result);
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('cinematic-arts-institute server is running')
})

app.listen(port, () => {
    console.log(`cinematic-arts-institute server is running on port ${port}`)
})