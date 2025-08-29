// assets/js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDC4-goP-5iEcfxy88ALYMua1ogTDLh0Y8",
  authDomain: "mc-quiz-maker.firebaseapp.com",
  projectId: "mc-quiz-maker",
  storageBucket: "mc-quiz-maker.appspot.com",
  messagingSenderId: "504500435767",
  appId: "1:504500435767:web:bf9d1f22827ead1d66f8b2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);