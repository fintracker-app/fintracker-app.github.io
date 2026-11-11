// Penerima notifikasi FinTracker versi web saat aplikasi sedang ditutup.
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Sama dengan isi lib/firebase_web_options.dart
firebase.initializeApp({
  apiKey: 'AIzaSyCS22rqGppRytWGM2ajc4DdSSNLxvz7S0o',
  authDomain: 'fintracker-6a2ba.firebaseapp.com',
  projectId: 'fintracker-6a2ba',
  storageBucket: 'fintracker-6a2ba.firebasestorage.app',
  messagingSenderId: '881487993588',
  appId: '1:881487993588:web:1437546035807b382f1ca1',
});

firebase.messaging();
