import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';
import { ref, onValue, query, orderByChild, remove } from 'firebase/database';
import { db } from './firebase';
import { FiRefreshCw, FiAlertCircle, FiCopy, FiClock, FiInbox } from 'react-icons/fi';
import { Toaster, toast } from 'react-hot-toast';

const socket = io('http://localhost:3001');

function App() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const isMessageExpired = (timestamp) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = (now - messageDate) / (1000 * 60);
    return diffInMinutes > 10;
  };

  const getRemainingTime = (timestamp) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.max(0, 10 - Math.floor((now - messageDate) / (1000 * 60)));
    return diffInMinutes;
  };

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Socket connected successfully!', socket.id);
      setSocketStatus('connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected!');
      setSocketStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setSocketStatus('error');
    });

    const messagesRef = ref(db, 'messages');
    const messagesQuery = query(messagesRef, orderByChild('timestamp'));
    
    const unsubscribe = onValue(messagesQuery, (snapshot) => {
      const messages = [];
      snapshot.forEach((childSnapshot) => {
        const message = childSnapshot.val();
        if (!isMessageExpired(message.timestamp)) {
          messages.push(message);
        } else {
          const messageRef = ref(db, `messages/${childSnapshot.key}`);
          remove(messageRef).catch(error => {
            console.error('Error removing expired message:', error);
          });
        }
      });
      console.log('Active messages:', messages);
      setMessages(messages);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching messages:', error);
      setError('Failed to fetch messages');
      setLoading(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const formatMessageTime = (timestamp) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - messageDate) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) { // less than 24 hours
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days}d ago`;
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  };

  const extractCode = (text) => {
    // Match 6-digit or 5-digit codes
    const codeMatch = text.match(/\b\d{5,6}\b/);
    return codeMatch ? codeMatch[0] : null;
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success('Code copied to clipboard!', {
          duration: 2000,
          position: 'bottom-center',
          style: {
            background: '#2d3748',
            color: '#fff',
            fontSize: '14px',
          },
        });
      })
      .catch(err => {
        toast.error('Failed to copy code');
        console.error('Failed to copy:', err);
      });
  };

  const groupMessagesByDate = (messages) => {
    const groups = {};
    // First sort all messages by timestamp (newest first)
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    sortedMessages.forEach(message => {
      const date = new Date(message.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(message);
    });
    
    // Sort messages within each group (newest first)
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
    });
    
    return groups;
  };

  return (
    <div className="App">
      <Toaster />
      <div className="notice-banner">
        <div className="notice-content">
          <FiClock size={16} />
          <span>All verification codes expire after 5 minutes</span>
        </div>
      </div>
      <header className="App-header">
        <div className="header-left">
          <h1>Messages</h1>
          <div className={`socket-status ${socketStatus}`}>
            {socketStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <button className="refresh-button" onClick={handleRefresh}>
          <FiRefreshCw size={16} />
          Refresh
        </button>
      </header>

      <div className="messages-container">
        {loading ? (
          <div className="loading">
            <FiRefreshCw size={20} className="spin" /> 
            Loading messages...
          </div>
        ) : error ? (
          <div className="error">
            <FiAlertCircle size={20} />
            <p>{error}</p>
            <button 
              className="retry-button"
              onClick={() => {
                setRetryCount(prev => prev + 1);
                handleRefresh();
              }}
            >
              Try Again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <FiInbox size={48} />
            <h3>No Messages Yet</h3>
            <p>New messages will appear here</p>
          </div>
        ) : (
          Object.entries(groupMessagesByDate(messages))
            .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
            .map(([date, dateMessages]) => (
              <div key={date} className="message-group">
                <div className="date-header">{date}</div>
                {dateMessages.map((message, index) => {
                  const code = extractCode(message.body);
                  const remainingMinutes = getRemainingTime(message.timestamp);
                  
                  return (
                    <div key={index} className="message">
                      <div className="message-header">
                        <p className="message-from">{message.from}</p>
                        <div className="message-meta">
                          <p className="message-time">
                            {formatMessageTime(message.timestamp)}
                          </p>
                          <p className={`expiration-time ${remainingMinutes <= 2 ? 'expiring-soon' : ''}`}>
                            {remainingMinutes > 0 ? `${remainingMinutes}m left` : 'Expiring...'}
                          </p>
                        </div>
                      </div>
                      <div className="message-content">
                        <p className="message-body">{message.body}</p>
                        {code && (
                          <button 
                            className="copy-code-button"
                            onClick={() => handleCopy(code)}
                            title="Copy code"
                          >
                            <span className="code">{code}</span>
                            <span className="label">Copy code</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
        )}
      </div>

      <div className={`connection-status ${isOnline ? 'online' : 'offline'}`}>
        {isOnline ? (
          <>
            <div className="status-dot online" />
            Connected to internet
          </>
        ) : (
          <>
            <div className="status-dot offline" />
            No internet connection
          </>
        )}
      </div>
    </div>
  );
}

export default App; 