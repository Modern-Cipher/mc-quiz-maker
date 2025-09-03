// dashboard/dashboard.js

import { auth, db } from '../assets/js/firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, query, where, onSnapshot, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser;
let currentEditQuizId = null;
let detailsModal = null; // Variable to hold the modal instance

// NEW: Initialize Modal on page load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('detailsModal')) {
        detailsModal = new bootstrap.Modal(document.getElementById('detailsModal'));
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('user-email').textContent = user.email;
        loadQuizzes(user.uid);
    } else {
        window.location.href = '/mc-quiz-maker/index.html';
    }
});

const questionsContainer = document.getElementById('questions-container');
let questionCounter = 0;

function renumberQuestions() {
    const allQuestionBlocks = questionsContainer.querySelectorAll('.card.card-body');
    allQuestionBlocks.forEach((block, index) => {
        const titleElement = block.querySelector('strong');
        if (titleElement) {
            titleElement.textContent = `Question ${index + 1}`;
        }
        block.dataset.questionNumber = index + 1;
    });
}

function addQuestionBlock(data = {}) {
    questionCounter++;
    const block = document.createElement('div');
    block.className = 'card card-body bg-light mb-3';
    block.id = `question-${questionCounter}`;
    const questionText = data.question || '';
    const options = data.options || ['', '', '', ''];
    const answer = data.answer;
    block.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><strong>Question ${questionCounter}</strong><button class="btn-close delete-question-btn" data-id="${questionCounter}"></button></div><input type="text" class="form-control mb-2 question-title" placeholder="Question" value="${questionText}"><div class="options">${options.map((opt, i) => `<div class="input-group mb-2"><div class="input-group-text"><input class="form-check-input mt-0" type="radio" name="answer-${questionCounter}" value="${i}" ${answer === i ? 'checked' : ''}></div><input type="text" class="form-control option-text" placeholder="Option ${i + 1}" value="${opt}"></div>`).join('')}</div>`;
    
    questionsContainer.appendChild(block);
    
    block.querySelector('.delete-question-btn').addEventListener('click', (e) => {
        const targetId = e.target.getAttribute('data-id');
        document.getElementById(`question-${targetId}`).remove();
        renumberQuestions();
    });
}

function resetForm() {
    currentEditQuizId = null;
    document.getElementById('quiz-title').value = '';
    document.getElementById('timer-type').value = 'none';
    document.getElementById('timer-value').value = '';
    document.getElementById('points-per-item').value = 1;
    document.getElementById('json-input').value = '';
    document.getElementById('timer-type').dispatchEvent(new Event('change'));
    
    questionsContainer.innerHTML = '';
    questionCounter = 0;
    addQuestionBlock();
    
    document.getElementById('form-title').innerHTML = '<i class="ri-add-circle-line"></i> Create a New Quiz';
    document.getElementById('save-quiz-btn').innerHTML = '<i class="ri-save-3-line"></i> Save Quiz';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    document.getElementById('generated-link-container').style.display = 'none';
    renumberQuestions();
}

async function editQuiz(quizId) {
    try {
        const quizRef = doc(db, "quizzes", quizId);
        const quizSnap = await getDoc(quizRef);
        if (!quizSnap.exists()) { Swal.fire('Error', 'Quiz not found.', 'error'); return; }
        
        const quizData = quizSnap.data();
        currentEditQuizId = quizId;

        document.getElementById('quiz-title').value = quizData.title;
        document.getElementById('timer-type').value = quizData.settings.timerType;
        document.getElementById('timer-value').value = quizData.settings.timerValue;
        document.getElementById('points-per-item').value = quizData.settings.pointsPerItem;
        document.getElementById('timer-type').dispatchEvent(new Event('change'));
        
        questionsContainer.innerHTML = '';
        questionCounter = 0;
        quizData.questions.forEach(q => addQuestionBlock(q));
        renumberQuestions();

        document.getElementById('form-title').innerHTML = '<i class="ri-pencil-line"></i> Edit Quiz';
        document.getElementById('save-quiz-btn').innerHTML = '<i class="ri-check-line"></i> Update Quiz';
        document.getElementById('cancel-edit-btn').style.display = 'block';
        document.getElementById('quiz-form-card').scrollIntoView({ behavior: 'smooth' });

    } catch (error) { console.error("Error fetching quiz for edit: ", error); Swal.fire('Error', 'Could not load quiz for editing.', 'error'); }
}

async function deleteQuiz(quizId, quizTitle) {
    const result = await Swal.fire({
        title: 'Are you sure?', text: `This will delete "${quizTitle}" and all student attempts. You won't be able to revert this!`, icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', text: 'Please wait.', didOpen: () => { Swal.showLoading() } });
        try {
            const attemptsQuery = query(collection(db, "quizAttempts"), where("quizId", "==", quizId));
            const attemptsSnapshot = await getDocs(attemptsQuery);
            const deletePromises = [];
            attemptsSnapshot.forEach(doc => { deletePromises.push(deleteDoc(doc.ref)); });
            await Promise.all(deletePromises);
            await deleteDoc(doc(db, "quizzes", quizId));
            Swal.fire('Deleted!', `"${quizTitle}" has been deleted.`, 'success');
            document.getElementById('student-results-container').style.display = 'none';
        } catch (error) { console.error("Error deleting quiz and attempts: ", error); Swal.fire('Error!', 'Could not delete the quiz. Check the console.', 'error'); }
    }
}

function loadQuizzes(uid) {
    const q = query(collection(db, "quizzes"), where("createdBy", "==", uid), orderBy("createdAt", "desc"));
    const quizList = document.getElementById('quiz-list');
    onSnapshot(q, (querySnapshot) => {
        quizList.innerHTML = '';
        if (querySnapshot.empty) { quizList.innerHTML = '<p class="text-center text-muted">No quizzes created yet.</p>'; return; }
        querySnapshot.forEach((doc) => {
            const quiz = doc.data(); 
            const quizId = doc.id; 
            const baseUrl = `${window.location.origin}/mc-quiz-maker`;
            const quizUrl = `${baseUrl}/quiz/index.html?id=${quizId}`;
            
            const quizItem = document.createElement('a'); quizItem.href = "#"; quizItem.className = 'list-group-item list-group-item-action'; quizItem.dataset.quizId = quizId;
            quizItem.innerHTML = `<div class="d-flex w-100 justify-content-between"><h5 class="mb-1 quiz-title">${quiz.title}</h5><small>${quiz.createdAt ? quiz.createdAt.toDate().toLocaleDateString() : ''}</small></div><div class="quiz-actions mt-2"><button class="btn btn-sm btn-outline-secondary copy-btn"><i class="ri-clipboard-line"></i> Copy Link</button><button class="btn btn-sm btn-outline-success view-btn"><i class="ri-external-link-line"></i> View Quiz</button><button class="btn btn-sm btn-outline-warning edit-btn"><i class="ri-pencil-line"></i> Edit</button><button class="btn btn-sm btn-outline-danger delete-btn"><i class="ri-delete-bin-line"></i> Delete</button></div>`;
            
            // UPDATED: Pass the full quiz object to displayStudentAttempts
            quizItem.addEventListener('click', (e) => { 
                e.preventDefault(); 
                if (e.target.closest('.quiz-actions')) return; 
                document.querySelectorAll('.list-group-item').forEach(item => item.classList.remove('active')); 
                quizItem.classList.add('active'); 
                displayStudentAttempts(quizId, quiz); // Pass the whole quiz object
            });

            quizItem.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); editQuiz(quizId); });
            quizItem.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteQuiz(quizId, quiz.title); });
            quizItem.querySelector('.copy-btn').addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(quizUrl).then(() => Swal.fire({ title: 'Copied!', icon: 'success', timer: 1500, showConfirmButton: false })); });
            quizItem.querySelector('.view-btn').addEventListener('click', (e) => { e.stopPropagation(); window.open(quizUrl, '_blank'); });
            quizList.appendChild(quizItem);
        });
    });
}

// UPDATED: To accept full quizData and add click events for "View Details"
function displayStudentAttempts(quizId, quizData) {
    const resultsContainer = document.getElementById('student-results-container'); 
    const resultsTitle = document.getElementById('results-quiz-title'); 
    const tableWrapper = document.getElementById('results-table-wrapper');
    resultsTitle.textContent = quizData.title; 
    resultsContainer.style.display = 'block'; 
    tableWrapper.innerHTML = '<p class="text-center text-muted">Loading results...</p>';
    
    const q = query(collection(db, "quizAttempts"), where("quizId", "==", quizId), orderBy("submittedAt", "desc"));
    
    onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) { 
            tableWrapper.innerHTML = '<p class="text-center text-muted">No students have taken this quiz yet.</p>'; 
            return; 
        }
        
        let tableHTML = `<table class="table table-striped table-hover"><thead class="table-dark"><tr><th>Student Name</th><th>Email</th><th>Score</th><th>Date Submitted</th><th>Actions</th></tr></thead><tbody>`;
        
        querySnapshot.forEach((doc) => {
            const attempt = doc.data(); 
            const studentName = `${attempt.studentInfo.title} ${attempt.studentInfo.firstName} ${attempt.studentInfo.lastName}`; 
            const submissionDate = attempt.submittedAt ? attempt.submittedAt.toDate().toLocaleString() : 'N/A'; 
            const score = `${attempt.score} / ${attempt.totalPoints}`;
            tableHTML += `<tr><td>${studentName}</td><td>${attempt.studentInfo.email}</td><td>${score}</td><td>${submissionDate}</td><td><button class="btn btn-sm btn-outline-info view-details-btn" data-attempt-id="${doc.id}">View Details</button></td></tr>`;
        });
        
        tableHTML += `</tbody></table>`; 
        tableWrapper.innerHTML = tableHTML;

        // NEW: Add event listeners to all "View Details" buttons
        document.querySelectorAll('.view-details-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const attemptId = e.target.getAttribute('data-attempt-id');
                const attemptDoc = await getDoc(doc(db, "quizAttempts", attemptId));
                if (attemptDoc.exists()) {
                    showAttemptDetails(attemptDoc.data(), quizData);
                }
            });
        });
    });
}

// NEW: Function to build review and show modal
function showAttemptDetails(attemptData, quizData) {
    const modalBody = document.getElementById('modal-body-content');
    const studentName = `${attemptData.studentInfo.title} ${attemptData.studentInfo.firstName} ${attemptData.studentInfo.lastName}`;
    const score = `${attemptData.score} / ${attemptData.totalPoints}`;

    let reviewHTML = `
        <h4>${quizData.title}</h4>
        <p>Attempt by: <strong>${studentName}</strong></p>
        <p>Final Score: <strong>${score}</strong></p>
        <hr>
    `;

    quizData.questions.forEach((q, index) => {
        const studentAnswerIndex = attemptData.answers[index];
        const correctAnswerIndex = q.answer;
        const isCorrect = studentAnswerIndex === correctAnswerIndex;
        const studentAnswerText = (studentAnswerIndex !== null) ? q.options[studentAnswerIndex] : 'No Answer';
        const correctAnswerText = q.options[correctAnswerIndex];

        reviewHTML += `
            <div class="review-item ${isCorrect ? 'correct' : 'incorrect'}">
                <p class="fw-bold mb-2">Q${index + 1}: ${q.question}</p>
                <div class="your-answer text-${isCorrect ? 'success' : 'danger'}">
                    <i class="ri-${isCorrect ? 'check-line' : 'close-line'}"></i>
                    <span>Their Answer: ${studentAnswerText}</span>
                </div>
                ${!isCorrect ? `
                <div class="correct-answer text-success mt-2">
                    <i class="ri-check-double-line"></i>
                    <span>Correct Answer: ${correctAnswerText}</span>
                </div>` : ''}
            </div>
        `;
    });

    modalBody.innerHTML = reviewHTML;
    detailsModal.show(); // Show the Bootstrap modal
}


// --- Event Listeners and Save Button (Unchanged from your working version) ---
document.getElementById('logout-btn').addEventListener('click', () => { signOut(auth).then(() => { window.location.href = '/mc-quiz-maker/index.html'; }); });
document.getElementById('cancel-edit-btn').addEventListener('click', resetForm);
document.getElementById('add-question-btn').addEventListener('click', () => { addQuestionBlock(); });
document.getElementById('timer-type').addEventListener('change', (e) => { const timerInputContainer = document.getElementById('timer-input-container'); const timerUnitLabel = document.getElementById('timer-unit-label'); if (e.target.value === 'none') { timerInputContainer.style.display = 'none'; } else { timerInputContainer.style.display = 'block'; timerUnitLabel.textContent = (e.target.value === 'per-item') ? 'Seconds' : 'Minutes'; } });
document.getElementById('import-json-btn').addEventListener('click', () => {
    const jsonInput = document.getElementById('json-input').value; if (!jsonInput) { Swal.fire('Empty Input', 'Please paste your JSON data.', 'warning'); return; }
    let questions; 
    try { questions = JSON.parse(jsonInput); } catch (error) { console.error("JSON Parsing Error Details:", error); Swal.fire({ title: 'Invalid JSON Syntax', html: `Please check your format. Open the console (F12) for technical details.<br><br><b>Error:</b> ${error.message}`, icon: 'error' }); return; }
    if (!Array.isArray(questions)) { Swal.fire('Wrong Data Structure', 'The JSON must be an array `[...]`.', 'error'); return; }
    Swal.fire({ title: 'Please wait...', text: 'Validating and generating your quiz format.', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
    setTimeout(() => {
        const validQuestions = []; const invalidItems = [];
        questions.forEach((item, index) => {
            const errors = [];
            if (!item || typeof item !== 'object') { errors.push('Item is not a valid object.'); } 
            else {
                if (!item.question || typeof item.question !== 'string' || item.question.trim() === '') { errors.push('Missing or empty "question".'); }
                if (!Array.isArray(item.options) || item.options.length !== 4) { errors.push('The "options" must be an array with exactly 4 items.'); } 
                else if (item.options.some(opt => typeof opt !== 'string' || opt.trim() === '')) { errors.push('One or more options are blank.'); }
                if (typeof item.answer !== 'number' || item.answer < 0 || item.answer > 3) { errors.push('The "answer" must be a number between 0 and 3.'); }
            }
            if (errors.length > 0) { invalidItems.push({ itemNumber: index + 1, reasons: errors.join(' ') }); } 
            else { validQuestions.push(item); }
        });
        questionsContainer.innerHTML = ''; questionCounter = 0;
        validQuestions.forEach(q => addQuestionBlock(q));
        renumberQuestions();
        let summaryText = `<b>${validQuestions.length} questions were imported successfully.</b>`;
        if (invalidItems.length > 0) { summaryText += `<br><br>${invalidItems.length} items were skipped due to errors.`; }
        Swal.fire({ title: 'Import Complete!', html: summaryText, icon: invalidItems.length > 0 ? 'warning' : 'success' });
    }, 500);
});
document.getElementById('save-quiz-btn').addEventListener('click', async () => {
    document.querySelectorAll('.card.card-body').forEach(b => b.style.border = '1px solid #ddd');
    const questionBlocks = document.querySelectorAll('.card.card-body.bg-light.mb-3');
    const incompleteQuestions = [];
    questionBlocks.forEach((block) => {
        const questionNumber = block.dataset.questionNumber;
        const questionTitle = block.querySelector('.question-title').value;
        const options = Array.from(block.querySelectorAll('.option-text')).map(input => input.value);
        const correctAnswerNode = block.querySelector(`input[type="radio"]:checked`);
        if (!questionTitle.trim() || options.some(opt => !opt.trim()) || !correctAnswerNode) {
            incompleteQuestions.push(questionNumber);
            block.style.border = '2px solid red';
        }
    });
    if (incompleteQuestions.length > 0) {
        const firstErrorBlock = document.querySelector(`[data-question-number="${incompleteQuestions[0]}"]`);
        firstErrorBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        Swal.fire({ title: 'Incomplete Questions', text: `Please fill out all fields for the highlighted questions: #${incompleteQuestions.join(', #')}`, icon: 'error' });
        return;
    }
    const quizTitle = document.getElementById('quiz-title').value;
    const timerType = document.getElementById('timer-type').value; const timerValue = parseInt(document.getElementById('timer-value').value);
    if (!quizTitle) { Swal.fire('Oops...', 'Please enter a quiz title.', 'warning'); return; }
    if (timerType !== 'none' && (!timerValue || timerValue <= 0)) { Swal.fire('Oops...', 'Please enter a valid number greater than 0 for the timer.', 'warning'); return; }
    const quizData = { title: quizTitle, createdBy: currentUser.uid, settings: { timerType: timerType, timerValue: timerValue || 0, pointsPerItem: parseInt(document.getElementById('points-per-item').value) || 1 }, questions: [] };
    questionBlocks.forEach(block => {
        const questionTitle = block.querySelector('.question-title').value; const options = Array.from(block.querySelectorAll('.option-text')).map(input => input.value); const correctAnswerNode = block.querySelector(`input[type="radio"]:checked`);
        quizData.questions.push({ question: questionTitle, options: options, answer: parseInt(correctAnswerNode.value) });
    });
    try {
        if (currentEditQuizId) {
            quizData.updatedAt = serverTimestamp();
            const quizRef = doc(db, "quizzes", currentEditQuizId);
            await updateDoc(quizRef, quizData);
            Swal.fire('Success!', 'Quiz updated successfully.', 'success');
            resetForm();
        } else {
            quizData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, "quizzes"), quizData);
            const baseUrl = `${window.location.origin}/mc-quiz-maker`;
            const quizUrl = `${baseUrl}/quiz/index.html?id=${docRef.id}`;
            Swal.fire({
                title: 'Quiz Saved!', icon: 'success',
                html: `<p>Your quiz link has been generated successfully.</p><div class="input-group mt-3"><input type="text" class="form-control" value="${quizUrl}" id="swal-quiz-link" readonly><button class="btn btn-outline-primary" id="swal-copy-btn"><i class="ri-clipboard-line"></i> Copy</button></div>`,
                showConfirmButton: true, confirmButtonText: 'Create Another Quiz',
                didOpen: () => {
                    const copyBtn = document.getElementById('swal-copy-btn'); const linkInput = document.getElementById('swal-quiz-link');
                    copyBtn.addEventListener('click', () => { linkInput.select(); navigator.clipboard.writeText(linkInput.value); copyBtn.textContent = 'Copied!'; });
                }
            }).then((result) => { if (result.isConfirmed || result.isDismissed) { resetForm(); } });
        }
    } catch (e) { console.error("Error saving document: ", e); Swal.fire('Error', 'Failed to save quiz. Check console for details.', 'error'); }
});
document.getElementById('copy-link-btn').addEventListener('click', () => { const quizLinkInput = document.getElementById('quiz-link'); navigator.clipboard.writeText(quizLinkInput.value).then(() => { Swal.fire({ title: 'Copied!', icon: 'success', timer: 1500, showConfirmButton: false }); }); });

// Initial Load
resetForm();