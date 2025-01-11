import { ref, set, push, onValue } from 'firebase/database';
import { db } from './firebase';
import { useEffect } from 'react';

export function TestFirebase() {
  useEffect(() => {
    // Test writing to Firebase
    const testMessage = {
      from: '+1234567890',
      body: 'Test message from Firebase',
      timestamp: new Date().toISOString()
    };

    // Reference to messages
    const messagesRef = ref(db, 'messages');

    // Push new message
    push(messagesRef, testMessage)
      .then(() => {
        console.log('Test message written successfully');
      })
      .catch((error) => {
        console.error('Error writing message:', error);
      });

    // Listen for changes
    onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      console.log('Current messages in Firebase:', data);
    });
  }, []);

  return <div>Testing Firebase Connection...</div>;
} 