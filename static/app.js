// Global state
let currentTab = 'input';
let patients = [];
let resources = [];
let stats = {};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setInterval(updateData, 30000); // Update every 30 seconds
});

async function initializeApp() {
    await updateData();
}

async function updateData() {
    try {
        await Promise.all([
            updateStats(),
            updatePatients(),
            updateResources()
        ]);
        updateUI();
    } catch (error) {
        console.error('Failed to update data:', error);
        showToast('Failed to update data', 'error');
    }
}

async function updateStats() {
    const response = await fetch('/api/stats');
    stats = await response.json();
}

async function updatePatients() {
    const response = await fetch('/api/patients');
    patients = await response.json();
}

async function updateResources() {
    const response = await fetch('/api/resources');
    resources = await response.json();
}

function updateUI() {
    updateStatsBar();
    updatePatientQueue();
    updateResourceList();
    updateStatsContent();
    checkCriticalResources();
}

function updateStatsBar() {
    document.getElementById('immediateCount').textContent = stats.immediate || 0;
    document.getElementById('delayedCount').textContent = stats.delayed || 0;
    document.getElementById('minimalCount').textContent = stats.minimal || 0;
    document.getElementById('expectantCount').textContent = stats.expectant || 0;
    document.getElementById('totalCount').textContent = stats.total || 0;
    document.getElementById('treatedCount').textContent = stats.treated || 0;
}

function checkCriticalResources() {
    const critical = resources.filter(r => r.current_stock <= r.critical_level);
    const alert = document.getElementById('resourceAlert');
    
    if (critical.length > 0) {
        alert.classList.remove('hidden');
        document.getElementById('criticalResources').textContent = 
            critical.map(r => r.resource_type).join(', ');
    } else {
        alert.classList.add('hidden');
    }
}

function updatePatientQueue() {
    const container = document.getElementById('patientQueue');
    if (!container) return;
    
    container.innerHTML = '';
    
    patients.forEach(patient => {
        const card = createPatientCard(patient);
        container.appendChild(card);
    });
}

function createPatientCard(patient) {
    const div = document.createElement('div');
    const categoryColors = {
        immediate: 'bg-red-600 border-red-500',
        delayed: 'bg-yellow-600 border-yellow-500',
        minimal: 'bg-green-600 border-green-500',
        expectant: 'bg-gray-600 border-gray-500'
    };
    
    div.className = `${categoryColors[patient.triage_category]} border-2 rounded-lg p-4 text-white`;
    div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div>
                <h3 class="font-bold text-lg">${patient.patient_id}</h3>
                <p class="text-sm opacity-90">Priority: ${patient.priority} | Score: ${patient.triage_score}</p>
            </div>
            <div class="text-right">
                <span class="font-bold">${patient.triage_category.toUpperCase()}</span>
                <p class="text-xs">${new Date(patient.timestamp).toLocaleTimeString()}</p>
            </div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-3">
            <div>RR: ${patient.respiratory_rate || 'N/A'}</div>
            <div>HR: ${patient.pulse || 'N/A'}</div>
            <div>BP: ${patient.systolic_bp || 'N/A'}</div>
            <div>Conscious: ${patient.consciousness}</div>
        </div>
        
        <div class="text-sm mb-3">
            <strong>Injuries:</strong> ${patient.injury_type.join(', ')} (${patient.injury_severity})
            <br><strong>Regions:</strong> ${patient.body_regions.join(', ')}
            ${patient.estimated_age ? `<br><strong>Age:</strong> ${patient.estimated_age}` : ''}
            ${patient.gender ? ` | <strong>Gender:</strong> ${patient.gender}` : ''}
        </div>
        
        ${patient.notes ? `<div class="text-sm mb-3 bg-black bg-opacity-20 p-2 rounded"><strong>Notes:</strong> ${patient.notes}</div>` : ''}
        
        <div class="flex gap-2">
            <button onclick="startTreatment(${patient.id})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors">
                ${patient.treatment_started ? '✅ Treating' : '🏥 Start Treatment'}
            </button>
            <button onclick="updateOutcome(${patient.id}, 'stable')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors">
                ✅ Stable
            </button>
            <button onclick="updateOutcome(${patient.id}, 'evacuated')" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors">
                🚁 Evacuate
            </button>
        </div>
    `;
    
    return div;
}

function updateResourceList() {
    const container = document.getElementById('resourceList');
    if (!container) return;
    
    container.innerHTML = '';
    
    resources.forEach(resource => {
        const card = createResourceCard(resource);
        container.appendChild(card);
    });
}

function createResourceCard(resource) {
    const div = document.createElement('div');
    const isCritical = resource.current_stock <= resource.critical_level;
    
    div.className = `bg-gray-800 border ${isCritical ? 'border-red-500' : 'border-gray-600'} rounded-lg p-4`;
    div.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-white font-bold text-lg capitalize">${resource.resource_type.replace('_', ' ')}</h3>
            <span class="text-2xl font-bold ${isCritical ? 'text-red-400' : 'text-green-400'}">
                ${resource.current_stock}
            </span>
        </div>
        
        <div class="mb-4">
            <div class="flex justify-between text-sm text-gray-300 mb-1">
                <span>Stock Level</span>
                <span>Critical: ${resource.critical_level}</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-2">
                <div class="h-2 rounded-full ${isCritical ? 'bg-red-500' : 'bg-green-500'}" 
                     style="width: ${Math.min(100, (resource.current_stock / (resource.critical_level * 2)) * 100)}%"></div>
            </div>
        </div>
        
        <div class="flex gap-2">
            <input type="number" id="stock_${resource.id}" value="${resource.current_stock}" 
                   class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white">
            <button onclick="updateResourceStock(${resource.id})" 
                    class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors">
                Update
            </button>
        </div>
        
        ${isCritical ? '<div class="mt-2 text-red-400 text-sm font-bold">⚠️ CRITICAL LEVEL</div>' : ''}
    `;
    
    return div;
}

function updateStatsContent() {
    const container = document.getElementById('statsContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-800 rounded-lg p-6">
                <h3 class="text-xl font-bold text-white mb-4">📊 Patient Statistics</h3>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-300">Total Active:</span>
                        <span class="text-white font-bold">${stats.total || 0}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-red-400">🟥 Immediate:</span>
                        <span class="text-white font-bold">${stats.immediate || 0}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-yellow-400">🟨 Delayed:</span>
                        <span class="text-white font-bold">${stats.delayed || 0}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-green-400">🟩 Minimal:</span>
                        <span class="text-white font-bold">${stats.minimal || 0}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">⬛ Expectant:</span>
                        <span class="text-white font-bold">${stats.expectant || 0}</span>
                    </div>
                </div>
            </div>
            
            <div class="bg-gray-800 rounded-lg p-6">
                <h3 class="text-xl font-bold text-white mb-4">🏥 Treatment Status</h3>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-300">Treated:</span>
                        <span class="text-green-400 font-bold">${stats.treated || 0}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-300">Evacuated:</span>
                        <span class="text-blue-400 font-bold">${stats.evacuated || 0}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-300">Deceased:</span>
                        <span class="text-red-400 font-bold">${stats.deceased || 0}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="bg-gray-800 rounded-lg p-6">
            <h3 class="text-xl font-bold text-white mb-4">📋 Quick Actions</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onclick="generateReport()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded transition-colors">
                    📄 Generate Report
                </button>
                <button onclick="exportData()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded transition-colors">
                    💾 Export Data
                </button>
            </div>
        </div>
    `;
}

// Tab management
function setActiveTab(tabName) {
    currentTab = tabName;
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Show active tab
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.className = 'tab-button flex-1 py-4 px-2 text-center font-semibold transition-colors bg-blue-600 text-white';
        } else {
            btn.className = 'tab-button flex-1 py-4 px-2 text-center font-semibold transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600';
        }
    });
}

// Patient form submission
document.getElementById('patientForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        patient_id: formData.get('patient_id') || undefined,
        respiratory_rate: formData.get('respiratory_rate') ? parseInt(formData.get('respiratory_rate')) : undefined,
        pulse: formData.get('pulse') ? parseInt(formData.get('pulse')) : undefined,
        systolic_bp: formData.get('systolic_bp') ? parseInt(formData.get('systolic_bp')) : undefined,
        consciousness: formData.get('consciousness'),
        can_walk: formData.get('can_walk') === 'true',
        injury_type: formData.getAll('injury_type'),
        injury_severity: formData.get('injury_severity'),
        body_regions: formData.getAll('body_regions'),
        estimated_age: formData.get('estimated_age') ? parseInt(formData.get('estimated_age')) : undefined,
        gender: formData.get('gender') || undefined,
        notes: formData.get('notes') || undefined,
        medic: formData.get('medic') || undefined
    };
    
    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast(`Patient ${result.patient_id} triaged as ${result.category.toUpperCase()}`, 'success');
            e.target.reset();
            await updateData();
        } else {
            showToast('Failed to add patient', 'error');
        }
    } catch (error) {
        showToast('Error adding patient: ' + error.message, 'error');
    }
});

// Patient management functions
async function startTreatment(patientId) {
    try {
        const response = await fetch(`/api/patients/${patientId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ treatment_started: true })
        });
        
        if (response.ok) {
            showToast('Treatment started', 'success');
            await updateData();
        }
    } catch (error) {
        showToast('Failed to start treatment', 'error');
    }
}

async function updateOutcome(patientId, outcome) {
    try {
        const response = await fetch(`/api/patients/${patientId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome })
        });
        
        if (response.ok) {
            showToast(`Patient marked as ${outcome}`, 'success');
            await updateData();
        }
    } catch (error) {
        showToast('Failed to update patient', 'error');
    }
}

// Resource management
async function updateResourceStock(resourceId) {
    const input = document.getElementById(`stock_${resourceId}`);
    const newStock = parseInt(input.value);
    
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;
    
    try {
        const response = await fetch('/api/resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resource_type: resource.resource_type,
                current_stock: newStock
            })
        });
        
        if (response.ok) {
            showToast('Resource updated', 'success');
            await updateData();
        }
    } catch (error) {
        showToast('Failed to update resource', 'error');
    }
}

// Utility functions
function filterPatients(category) {
    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-white');
    });
    event.target.classList.add('ring-2', 'ring-white');
    
    // Filter patients
    const cards = document.querySelectorAll('#patientQueue > div');
    cards.forEach(card => {
        if (category === 'all') {
            card.style.display = 'block';
        } else {
            const isMatch = card.className.includes(category === 'immediate' ? 'bg-red-600' :
                                                   category === 'delayed' ? 'bg-yellow-600' :
                                                   category === 'minimal' ? 'bg-green-600' :
                                                   'bg-gray-600');
            card.style.display = isMatch ? 'block' : 'none';
        }
    });
}

async function generateReport() {
    showToast('Generating situation report...', 'info');
    // In a real app, this would call an AI service to generate a report
    setTimeout(() => {
        showToast('Report generated successfully', 'success');
    }, 2000);
}

function exportData() {
    const data = {
        timestamp: new Date().toISOString(),
        stats,
        patients,
        resources
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `triage-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully', 'success');
}
