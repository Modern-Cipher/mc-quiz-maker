// quiz/quiz.js

import { db } from '../assets/js/firebase-config.js';
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Elements ---
const loadingState = document.getElementById('loading-state');
const studentInfoForm = document.getElementById('student-info-form');
const quizProper = document.getElementById('quiz-proper');
const resultsScreen = document.getElementById('results-screen');
const quizTitleHeader = document.getElementById('quiz-title-header');
const questionNumber = document.getElementById('question-number');
const timerDisplay = document.getElementById('timer-display');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const nextBtn = document.getElementById('next-btn');

// --- Quiz State ---
let quizId = null;
let quizData = null;
let studentInfo = {};
let studentAnswers = [];
let currentQuestionIndex = 0;
let score = 0;

// --- FIX: SEPARATE TIMER INTERVALS ---
let itemTimerInterval = null;
let totalTimerInterval = null;


// --- NEW: REFRESH HANDLING - Warn user before they leave ---
window.addEventListener('beforeunload', (event) => {
    // Show prompt only if the quiz section is visible
    if (quizProper.style.display === 'block') {
        event.preventDefault();
        event.returnValue = ''; // Required for legacy browsers
    }
});


// --- Initialization ---
window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    quizId = urlParams.get('id');

    if (!quizId) {
        loadingState.innerHTML = '<h1 class="h3 text-danger">Error: Invalid Quiz Link</h1>';
        return;
    }

    try {
        const quizRef = doc(db, "quizzes", quizId);
        const quizSnap = await getDoc(quizRef);

        if (quizSnap.exists()) {
            quizData = quizSnap.data();
            quizTitleHeader.textContent = quizData.title;

            // --- NEW: REFRESH HANDLING - Check for saved progress ---
            const savedState = sessionStorage.getItem('quizState_' + quizId);
            if (savedState) {
                Swal.fire({
                    title: 'Resume Quiz?',
                    text: "We found your saved progress for this quiz.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, resume!',
                    cancelButtonText: 'No, start over.'
                }).then((result) => {
                    if (result.isConfirmed) {
                        resumeQuiz(JSON.parse(savedState));
                    } else {
                        sessionStorage.removeItem('quizState_' + quizId);
                        sessionStorage.removeItem('timerEndTime_' + quizId);
                        loadingState.style.display = 'none';
                        studentInfoForm.style.display = 'block';
                    }
                });
            } else {
                loadingState.style.display = 'none';
                studentInfoForm.style.display = 'block';
            }

        } else {
            loadingState.innerHTML = '<h1 class="h3 text-danger">Error: Quiz Not Found</h1>';
        }
    } catch (error) {
        console.error("Error fetching quiz:", error);
        loadingState.innerHTML = '<h1 class="h3 text-danger">Error</h1><p>Could not load the quiz.</p>';
    }
};

studentInfoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    studentInfo = { title: document.getElementById('student-title').value, firstName: document.getElementById('student-fname').value, middleInitial: document.getElementById('student-mi').value, lastName: document.getElementById('student-lname').value, email: document.getElementById('student-email').value, };
    startQuiz();
});

nextBtn.addEventListener('click', handleNextQuestion);

function startQuiz() {
    studentInfoForm.style.display = 'none';
    quizProper.style.display = 'block';

    // --- NEW: REFRESH HANDLING - Save initial state ---
    saveProgress();

    if (quizData.settings.timerType === 'total' && quizData.settings.timerValue > 0) {
        const endTime = Date.now() + quizData.settings.timerValue * 60 * 1000;
        sessionStorage.setItem('timerEndTime_' + quizId, endTime);
        startTotalTimer(quizData.settings.timerValue * 60);
    }
    displayQuestion(currentQuestionIndex);
}

// --- NEW: Function to resume a quiz from saved state ---
function resumeQuiz(savedState) {
    studentInfo = savedState.studentInfo;
    studentAnswers = savedState.studentAnswers;
    currentQuestionIndex = savedState.currentQuestionIndex;

    loadingState.style.display = 'none';
    quizProper.style.display = 'block';

    const endTime = sessionStorage.getItem('timerEndTime_' + quizId);
    if (endTime) {
        const remainingSeconds = Math.round((parseInt(endTime) - Date.now()) / 1000);
        if (remainingSeconds > 0) {
            startTotalTimer(remainingSeconds);
        } else {
            submitQuiz(); // Time is up if they refresh after timer ended
        }
    }
    displayQuestion(currentQuestionIndex);
}

function displayQuestion(index) {
    if (itemTimerInterval) clearInterval(itemTimerInterval); // Clear only item timer
    
    const question = quizData.questions[index];
    const letters = ['A', 'B', 'C', 'D'];
    questionNumber.textContent = `Question ${index + 1} of ${quizData.questions.length}`;
    questionText.textContent = question.question;

    optionsContainer.innerHTML = '';
    question.options.forEach((option, i) => {
        const optionId = `q${index}_option${i}`;
        const label = document.createElement('label');
        label.className = 'list-group-item option-label';
        label.htmlFor = optionId;
        label.innerHTML = `<input type="radio" class="form-check-input visually-hidden" name="question${index}" id="${optionId}" value="${i}"><div class="option-letter">${letters[i]}</div><div class="option-text">${option}</div>`;
        optionsContainer.appendChild(label);
    });

    if (quizData.settings.timerType === 'per-item' && quizData.settings.timerValue > 0) {
        startItemTimer(quizData.settings.timerValue);
    }
    
    nextBtn.innerHTML = (index === quizData.questions.length - 1) ? 'Submit <i class="ri-check-double-line"></i>' : 'Next <i class="ri-arrow-right-s-line"></i>';
}

function startTotalTimer(duration) {
    let timer = duration;
    totalTimerInterval = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (--timer < 0) {
            clearInterval(totalTimerInterval);
            submitQuiz();
        }
    }, 1000);
}

function startItemTimer(duration) {
    let timer = duration;
    itemTimerInterval = setInterval(() => {
        timerDisplay.textContent = `00:${timer.toString().padStart(2, '0')}`;
        if (--timer < 0) {
            clearInterval(itemTimerInterval);
            handleNextQuestion();
        }
    }, 1000);
}

function handleNextQuestion() {
    const selectedOption = document.querySelector(`input[name="question${currentQuestionIndex}"]:checked`);
    studentAnswers[currentQuestionIndex] = selectedOption ? parseInt(selectedOption.value) : null;
    currentQuestionIndex++;
    
    saveProgress(); // Save progress after every answer

    if (currentQuestionIndex < quizData.questions.length) {
        displayQuestion(currentQuestionIndex);
    } else {
        submitQuiz();
    }
}

// --- NEW: Function to save progress to sessionStorage ---
function saveProgress() {
    const state = {
        studentInfo: studentInfo,
        studentAnswers: studentAnswers,
        currentQuestionIndex: currentQuestionIndex
    };
    sessionStorage.setItem('quizState_' + quizId, JSON.stringify(state));
}


async function submitQuiz() {
    // Clear all timers and intervals
    if (itemTimerInterval) clearInterval(itemTimerInterval);
    if (totalTimerInterval) clearInterval(totalTimerInterval);

    // Clear saved progress from session storage
    sessionStorage.removeItem('quizState_' + quizId);
    sessionStorage.removeItem('timerEndTime_' + quizId);

    quizData.questions.forEach((question, index) => {
        if (studentAnswers[index] === question.answer) {
            score += quizData.settings.pointsPerItem;
        }
    });

    try {
        await addDoc(collection(db, "quizAttempts"), {
            quizId: quizId, quizTitle: quizData.title, studentInfo: studentInfo, answers: studentAnswers, score: score,
            totalPoints: quizData.settings.pointsPerItem * quizData.questions.length, submittedAt: serverTimestamp()
        });
    } catch (error) { console.error("Error submitting results: ", error); }
    
    quizProper.style.display = 'none';
    resultsScreen.style.display = 'block';
    document.getElementById('result-student-name').textContent = `${studentInfo.firstName} ${studentInfo.lastName}`;
    const totalPoints = quizData.settings.pointsPerItem * quizData.questions.length;
    document.getElementById('final-score').textContent = `${score} / ${totalPoints}`;
}