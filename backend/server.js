require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type"]
  }
});

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: '*/*' }));

// Temporarily disable Twilio validation for testing
const twilioWebhookMiddleware = twilio.webhook({
  validate: false
});

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://displaysms-e4620-default-rtdb.firebaseio.com"
});

const db = admin.database();
const messagesRef = db.ref('messages');

// Store messages in memory (replace with a database in production)
let messages = [];

// Add an initial test message
messages.push({
  from: '+1234567890',
  body: 'Initial test message',
  timestamp: new Date(),
});

// At the top level, add a route logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Handle incoming SMS
app.post('/sms', (req, res) => {
  console.log('\n=== Incoming SMS Webhook ===');
  
  const message = {
    from: req.body.From || 'Unknown',
    body: req.body.Body || 'No message content',
    timestamp: new Date().toISOString(),
  };
  
  // Save to Firebase
  messagesRef.push(message)
    .then(() => {
      console.log('Message saved to Firebase');
      io.emit('newMessage', message);
      res.set('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    })
    .catch(error => {
      console.error('Error saving to Firebase:', error);
      res.status(500).send('Error saving message');
    });
});

// API endpoint to get all messages
app.get('/messages', async (req, res) => {
  try {
    const snapshot = await messagesRef.orderByChild('timestamp').once('value');
    const messages = [];
    snapshot.forEach(childSnapshot => {
      messages.push(childSnapshot.val());
    });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Add request validation
app.use((req, res, next) => {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Add error handling middleware at the bottom before server.listen
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Test endpoint
app.post('/test-sms', (req, res) => {
  const testMessage = {
    from: '+1234567890',
    body: 'Test message',
    timestamp: new Date(),
  };
  
  messages.push(testMessage);
  io.emit('newMessage', testMessage);
  res.json({ success: true, message: testMessage });
});

// GET version for easy browser testing
app.get('/test-sms', (req, res) => {
  const testMessage = {
    from: '+1234567890',
    body: 'Test message',
    timestamp: new Date(),
  };
  
  messages.push(testMessage);
  io.emit('newMessage', testMessage);
  res.json({ success: true, message: testMessage });
});

// Add this near your other routes
app.get('/webhook-test', (req, res) => {
  console.log('Webhook test endpoint hit');
  res.send('Webhook URL is working!');
});

// Add this near the top of your routes
app.get('/', (req, res) => {
  res.send('Server is running!');
});

app.post('/webhook-test', (req, res) => {
  console.log('\n=== Test Webhook Received ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  const testMessage = {
    from: '+1234567890',
    body: 'Webhook test message',
    timestamp: new Date(),
  };
  
  messages.push(testMessage);
  io.emit('newMessage', testMessage);
  
  res.status(200).json({ 
    success: true, 
    message: 'Test webhook received',
    messageAdded: testMessage 
  });
});

// Add near the top of your routes
app.post('/test-twilio', (req, res) => {
  console.log('\n=== Twilio Test Webhook ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Raw Body:', req.rawBody);
  
  // Send response in Twilio's expected format
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Current messages:', messages);
}); 