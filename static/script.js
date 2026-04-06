document.addEventListener('DOMContentLoaded', () => {
    function showToast(message, type="info") {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // --- Navigation Logic ---
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            const target = document.getElementById(item.dataset.target);
            target.classList.add('active');
        });
    });

    // --- State ---
    let patients = [];
    let analyzeResults = [];
    let biasChartObj = null;
    
    // --- Elements ---
    const form = document.getElementById('patient-form');
    const simulateBtn = document.getElementById('btn-simulate');
    const fixBiasBtn = document.getElementById('btn-fix-bias');
    const resultsContainer = document.getElementById('results-container');
    const biasPanel = document.getElementById('bias-alert-panel');
    const biasScoreEl = document.getElementById('bias-score');
    const patientsTbody = document.getElementById('patients-tbody');
    const noPatientsEl = document.getElementById('no-patients');
    const totalPatientsEl = document.getElementById('total-patients');
    
    // Settings elements
    const biasSensitivity = document.getElementById('bias-sensitivity');
    const sensitivityVal = document.getElementById('sensitivity-val');
    const fairnessMode = document.getElementById('fairness-mode');
    const treatmentStd = document.getElementById('treatment-std');
    const normalizeConf = document.getElementById('normalize-conf');
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    const resetSettingsBtn = document.getElementById('btn-reset-settings');

    // --- Form Logic ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newPatient = {
            name: document.getElementById('name').value,
            age: document.getElementById('age').value,
            gender: document.getElementById('gender').value,
            symptom: document.getElementById('symptom').value,
            severity: document.getElementById('severity').value,
            duration: document.getElementById('duration').value,
            conditions: document.getElementById('conditions').value,
            lifestyle: document.getElementById('lifestyle').value
        };
        
        patients.push(newPatient);
        updatePatientsTable();
        form.reset();
        showToast(`Patient ${newPatient.name} added successfully!`, "success");
    });

    function updatePatientsTable() {
        totalPatientsEl.textContent = patients.length;
        if (patients.length > 0) {
            noPatientsEl.style.display = 'none';
        } else {
            noPatientsEl.style.display = 'block';
            noPatientsEl.textContent = "No patients available";
        }
        
        patientsTbody.innerHTML = '';
        patients.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.name}</td>
                <td>${p.age}</td>
                <td>${p.gender}</td>
                <td>${p.symptom}</td>
                <td class="risk-level-cell">Pending</td>
                <td><button class="btn btn-danger btn-remove" data-index="${index}">Remove</button></td>
            `;
            patientsTbody.appendChild(tr);
        });

        // Add event listeners to remove buttons
        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = e.target.getAttribute('data-index');
                await removePatient(index);
            });
        });
    }

    async function removePatient(index) {
        if (!confirm("Are you sure you want to remove this patient?")) return;

        try {
            const res = await fetch('/remove-patient', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index: index })
            });

            if (res.ok) {
                const data = await res.json();
                patients = data.patients; // update local patients array

                updatePatientsTable();
                
                // If we have analysis results from before, we might want to just clear them or re-simulate
                // For safety, let's keep the existing logic and let user click 'Simulate' again to re-sync results,
                // or if no patients left, clear results.
                if (patients.length === 0) {
                    resultsContainer.innerHTML = '';
                    biasPanel.classList.add('hidden');
                    if (biasChartObj) {
                        biasChartObj.destroy();
                        biasChartObj = null;
                    }
                }
            } else {
                showToast('Failed to remove patient.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error removing patient.', 'error');
        }
    }

    // --- Simulate Logic ---
    simulateBtn.addEventListener('click', async () => {
        if (patients.length === 0) {
            showToast('Please add at least one patient before simulating.', 'error');
            return;
        }

        const btnOriginalText = simulateBtn.textContent;
        simulateBtn.textContent = 'Simulating...';
        simulateBtn.disabled = true;

        try {
            const res = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patients })
            });
            const data = await res.json();
            
            if (res.ok) {
                analyzeResults = data.results;
                renderResults(data.results, data.bias_score);
            } else {
                showToast(data.error || 'Analysis failed. Please try again.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Analysis failed due to a network error.', 'error');
        } finally {
            simulateBtn.textContent = btnOriginalText;
            simulateBtn.disabled = false;
        }
    });

    function renderResults(results, biasScore) {
        // Adjust bias panel
        biasPanel.classList.remove('hidden');
        biasScoreEl.textContent = biasScore + '%';
        
        if (biasScore > 5) {
            biasPanel.classList.remove('fair');
            document.getElementById('bias-explanation').textContent = "Variation observed in treatment recommendations across demographic groups.";
        } else {
            biasPanel.classList.add('fair');
            document.getElementById('bias-explanation').textContent = "Recommendations are fair and standardized across demographics.";
        }

        // Render Cards
        resultsContainer.innerHTML = '';
        results.forEach(res => {
            const r = res.risk_level.replace(' Risk', '');
            
            const card = document.createElement('div');
            card.classList.add('result-card');
            card.innerHTML = `
                <div class="card-header">
                    <h2>${res.patient.name}</h2>
                    <span class="risk-badge risk-${r}">${res.risk_level}</span>
                </div>
                <div class="detail-row">
                    <strong>Patient Summary</strong>
                    <span>Age: ${res.patient.age} | Gender: ${res.patient.gender}</span>
                </div>
                <div class="detail-row">
                    <strong>Clinical Assessment</strong>
                    <span>${res.clinical_assessment}</span>
                </div>
                <div class="detail-row">
                    <strong>Treatment Plan</strong>
                    <span>Medications: ${res.treatment_plan.medication.join(', ')}<br>
                    Lifestyle: ${res.treatment_plan.lifestyle.join(', ')}</span>
                </div>
                <div class="detail-row">
                    <strong>Personalized Care Plan</strong>
                    <span>${res.personalized_care}</span>
                </div>
                <div class="detail-row">
                    <strong>Recommended Tests</strong>
                    <span>${res.recommended_tests.join(', ')}</span>
                </div>
                <div class="detail-row">
                    <strong>Follow-Up Plan</strong>
                    <span>${res.follow_up}</span>
                </div>
                <div class="detail-row">
                    <strong>Recommended Action</strong>
                    <span>${res.recommended_action}</span>
                </div>
                <div class="detail-row">
                    <strong>Clinical Reasoning</strong>
                    <span>${res.clinical_reasoning}</span>
                </div>
                <div class="confidence-container">
                    <div class="confidence-header">
                        <span>Confidence Score</span>
                        <span>${res.confidence}%</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${res.confidence}%"></div>
                    </div>
                </div>
            `;
            resultsContainer.appendChild(card);
        });

        updatePatientsTableRiskLevels(results);
        updateChart(results, "Before Fix");
    }

    function updatePatientsTableRiskLevels(results) {
        const rows = patientsTbody.querySelectorAll('tr');
        results.forEach((res, i) => {
            if (rows[i]) {
                rows[i].children[4].textContent = res.risk_level;
            }
        });
    }

    // --- Fix Bias Logic ---
    fixBiasBtn.addEventListener('click', async () => {
        if (analyzeResults.length === 0) return;

        const btnOriginalText = fixBiasBtn.textContent;
        fixBiasBtn.textContent = 'Fixing...';
        fixBiasBtn.disabled = true;

        try {
            const res = await fetch('/fix-bias', { method: 'POST' });
            const data = await res.json();
            
            if (res.ok) {
                analyzeResults = data.results;
                renderResults(data.results, data.bias_score);
                updateChart(data.results, "After Fix");
                showToast(data.message, "success");
            }
        } catch(e) {
            console.error(e);
        } finally {
            fixBiasBtn.textContent = btnOriginalText;
            fixBiasBtn.disabled = false;
        }
    });

    // --- Chart Logic ---
    function updateChart(results, state) {
        const ctx = document.getElementById('biasChart').getContext('2d');
        
        let femaleCount = 0, femaleConf = 0;
        let maleCount = 0, maleConf = 0;

        results.forEach(r => {
            if (r.patient.gender.toLowerCase() === 'female') {
                femaleCount++;
                femaleConf += r.confidence;
            } else if (r.patient.gender.toLowerCase() === 'male') {
                maleCount++;
                maleConf += r.confidence;
            }
        });

        const avgFemale = femaleCount > 0 ? (femaleConf / femaleCount) : 0;
        const avgMale = maleCount > 0 ? (maleConf / maleCount) : 0;

        const datasetLabel = state === "Before Fix" ? "Avg Confidence Before Fix" : "Avg Confidence After Fix";

        if (biasChartObj) {
            
            if (state === "After Fix" && biasChartObj.data.datasets.length === 1) {
                biasChartObj.data.datasets.push({
                    label: datasetLabel,
                    data: [avgFemale, avgMale],
                    backgroundColor: 'rgba(0, 230, 118, 0.6)',
                    borderColor: 'rgba(0, 230, 118, 1)',
                    borderWidth: 1
                });
                biasChartObj.update();
            } else if (state === "Before Fix") {
                biasChartObj.data.datasets = [{
                    label: datasetLabel,
                    data: [avgFemale, avgMale],
                    backgroundColor: 'rgba(0, 210, 255, 0.6)',
                    borderColor: 'rgba(0, 210, 255, 1)',
                    borderWidth: 1
                }];
                biasChartObj.update();
            }
        } else {
            biasChartObj = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Female', 'Male'],
                    datasets: [{
                        label: datasetLabel,
                        data: [avgFemale, avgMale],
                        backgroundColor: 'rgba(0, 210, 255, 0.6)',
                        borderColor: 'rgba(0, 210, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#a0a0ab' }
                        },
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#a0a0ab' }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#ffffff' } }
                    }
                }
            });
        }
    }

    // --- Settings Logic ---
    biasSensitivity.addEventListener('input', (e) => {
        sensitivityVal.textContent = e.target.value;
    });

    async function loadSettings() {
        const res = await fetch('/get-settings');
        const data = await res.json();
        biasSensitivity.value = data.bias_sensitivity;
        sensitivityVal.textContent = data.bias_sensitivity;
        fairnessMode.checked = data.fairness_mode;
        treatmentStd.value = data.treatment_standardization;
        normalizeConf.checked = data.normalize_confidence;
    }
    
    saveSettingsBtn.addEventListener('click', async () => {
        const newSettings = {
            bias_sensitivity: parseInt(biasSensitivity.value),
            fairness_mode: fairnessMode.checked,
            treatment_standardization: treatmentStd.value,
            normalize_confidence: normalizeConf.checked
        };
        await fetch('/update-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        showToast('Settings saved!', 'success');
    });

    resetSettingsBtn.addEventListener('click', async () => {
        await fetch('/reset-settings', { method: 'POST' });
        loadSettings();
        showToast('Settings reset to default!', 'info');
    });

    loadSettings();
});
