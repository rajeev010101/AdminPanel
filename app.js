// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const flash = require('connect-flash');

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash()); // Add connect-flash middleware

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/data', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Define user schema
const userSchema = new mongoose.Schema({
    email: String,
    password: String
});
const User = mongoose.model('User', userSchema);

// Passport local strategy for authentication
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
},
(email, password, done) => {
    // Find user by email
    User.findOne({ email })
        .then(user => {
            if (!user) {
                return done(null, false, { message: 'Incorrect email.' });
            }
            // Compare passwords
            bcrypt.compare(password, user.password)
                .then(res => {
                    if (!res) {
                        return done(null, false, { message: 'Incorrect password.' });
                    }
                    return done(null, user);
                })
                .catch(err => done(err));
        })
        .catch(err => done(err));
}
));

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => {
            done(null, user);
        })
        .catch(err => done(err));
});

// Routes

// Signup route
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('error', 'Email already exists'); // Use req.flash to store error message
            return res.status(400).json({ message: 'Email already exists' });
        }
        // Hash password
        const hash = await bcrypt.hash(password, 10);
        const newUser = new User({
            email,
            password: hash
        });
        await newUser.save();
        res.json({ message: 'User created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Login route
app.post('/login', passport.authenticate('local', {
    successRedirect: '/admin',
    failureRedirect: '/login',
    failureFlash: true
}));

// Admin panel route
app.get('/admin', (req, res) => {
    if (req.isAuthenticated()) {
        res.send('Welcome to Admin Panel');
    } else {
        res.redirect('/login');
    }
});

// Login page route
app.get('/login', (req, res) => {
    res.send('Please login');
});

// Database Management Routes

// Route to add a new MongoDB instance
app.post('/add-instance', (req, res) => {
    const { instanceName, connectionString } = req.body;
    console.log(instanceName, connectionString)
    mongoose.connect(connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, `${instanceName} MongoDB connection error:`));
    mongoInstances[instanceName] = db;
    res.json({ message: `${instanceName} instance added successfully` });
});

// Route to display the list of connected instances and their information
app.get('/instances', async (req, res) => {
    try {
        const instanceInfo = [];
        for (const instanceName in mongoInstances) {
            const db = mongoInstances[instanceName];
            const databaseNames = await db.db.admin().listDatabases();
            const userCount = await User.countDocuments({});
            instanceInfo.push({
                instanceName,
                databases: databaseNames.databases.length,
                users: userCount
            });
        }
        res.json(instanceInfo);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Route to create a new database
app.post('/create-database/:instanceName', async (req, res) => {
    const { instanceName } = req.params;
    const { databaseName } = req.body;
    try {
        const db = mongoInstances[instanceName];
        await db.db(databaseName).createCollection('entries');
        res.json({ message: `Database ${databaseName} created successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Route to add an entry to a database
app.post('/add-entry/:instanceName/:databaseName', async (req, res) => {
    const { instanceName, databaseName } = req.params;
    const { entry } = req.body;
    try {
        const db = mongoInstances[instanceName];
        await db.db(databaseName).collection('entries').insertOne(entry);
        res.json({ message: `Entry added to ${databaseName} successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Route to remove a database
app.delete('/remove-database/:instanceName/:databaseName', async (req, res) => {
    const { instanceName, databaseName } = req.params;
    try {
        const db = mongoInstances[instanceName];
        await db.db(databaseName).dropDatabase();
        res.json({ message: `Database ${databaseName} removed successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
