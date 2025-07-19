from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import os
import json
from typing import Dict, List, Optional

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///triage.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Database Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(120), nullable=False)
    name = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.String(50), unique=True, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Vitals
    respiratory_rate = db.Column(db.Integer, nullable=True)
    pulse = db.Column(db.Integer, nullable=True)
    systolic_bp = db.Column(db.Integer, nullable=True)
    consciousness = db.Column(db.String(20), nullable=False)  # alert, voice, pain, unresponsive
    can_walk = db.Column(db.Boolean, nullable=False)
    
    # Injury assessment
    injury_type = db.Column(db.Text, nullable=False)  # JSON array
    injury_severity = db.Column(db.String(20), nullable=False)  # minor, moderate, severe, critical
    body_regions = db.Column(db.Text, nullable=False)  # JSON array
    
    # Demographics
    estimated_age = db.Column(db.Integer, nullable=True)
    gender = db.Column(db.String(10), nullable=True)
    
    # Triage results
    triage_category = db.Column(db.String(20), nullable=False)  # immediate, delayed, minimal, expectant
    triage_score = db.Column(db.Integer, nullable=False)
    priority = db.Column(db.Integer, nullable=False)
    
    # Treatment tracking
    treatment_started = db.Column(db.DateTime, nullable=True)
    treatment_notes = db.Column(db.Text, nullable=True)
    outcome = db.Column(db.String(20), nullable=True)  # stable, deteriorating, deceased, evacuated
    
    # Notes and location
    notes = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(100), nullable=True)
    medic = db.Column(db.String(50), nullable=True)

class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    resource_type = db.Column(db.String(50), unique=True, nullable=False)
    current_stock = db.Column(db.Integer, nullable=False)
    critical_level = db.Column(db.Integer, nullable=False)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)
    location = db.Column(db.String(100), nullable=True)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Triage Algorithm
class TriageCalculator:
    @staticmethod
    def calculate_triage_score(patient_data: Dict) -> Dict:
        score = 0
        
        # Respiratory assessment (START protocol)
        respiratory_rate = patient_data.get('respiratory_rate')
        if respiratory_rate is None or respiratory_rate == 0:
            return {"category": "expectant", "score": 0}
        
        if respiratory_rate > 30 or respiratory_rate < 10:
            score += 30
        
        # Perfusion assessment
        pulse = patient_data.get('pulse')
        if pulse and (pulse > 120 or pulse < 50):
            score += 25
        
        systolic_bp = patient_data.get('systolic_bp')
        if systolic_bp and systolic_bp < 90:
            score += 20
        
        # Mental status
        consciousness = patient_data.get('consciousness', 'alert')
        consciousness_scores = {
            'unresponsive': 35,
            'pain': 25,
            'voice': 15,
            'alert': 0
        }
        score += consciousness_scores.get(consciousness, 0)
        
        # Mobility
        if not patient_data.get('can_walk', True):
            score += 20
        
        # Injury severity
        injury_severity = patient_data.get('injury_severity', 'moderate')
        severity_scores = {
            'critical': 30,
            'severe': 20,
            'moderate': 10,
            'minor': 0
        }
        score += severity_scores.get(injury_severity, 10)
        
        # Body region modifiers
        body_regions = json.loads(patient_data.get('body_regions', '[]'))
        if 'head' in body_regions:
            score += 15
        if 'chest' in body_regions:
            score += 15
        if 'abdomen' in body_regions:
            score += 10
        
        # Injury type modifiers
        injury_types = json.loads(patient_data.get('injury_type', '[]'))
        if 'penetrating' in injury_types:
            score += 15
        if 'blast' in injury_types:
            score += 10
        if 'burn' in injury_types:
            score += 10
        
        # Determine category
        if score >= 80:
            category = "immediate"
        elif score >= 50:
            category = "delayed"
        elif score >= 20:
            category = "minimal"
        elif patient_data.get('can_walk') and consciousness == 'alert':
            category = "minimal"
        else:
            category = "expectant"
        
        return {"category": category, "score": score}

# Routes
@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('triage_app.html')
    return render_template('login.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        user = User.query.filter_by(username=username).first()
        
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return jsonify({'success': True, 'message': 'Login successful'})
        
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    return render_template('login.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    name = data.get('name')
    
    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'message': 'Username already exists'}), 400
    
    user = User(
        username=username,
        password_hash=generate_password_hash(password),
        email=email,
        name=name
    )
    
    db.session.add(user)
    db.session.commit()
    
    login_user(user)
    return jsonify({'success': True, 'message': 'Registration successful'})

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/api/patients', methods=['POST'])
@login_required
def add_patient():
    data = request.get_json()
    
    # Calculate triage score
    triage_result = TriageCalculator.calculate_triage_score(data)
    
    # Adjust priority based on resources
    resources = Resource.query.all()
    resource_map = {r.resource_type: r for r in resources}
    
    priority = triage_result['score']
    
    if triage_result['category'] == 'immediate':
        oxygen = resource_map.get('oxygen')
        morphine = resource_map.get('morphine')
        
        if oxygen and oxygen.current_stock <= oxygen.critical_level:
            priority *= 0.8
        if morphine and morphine.current_stock <= morphine.critical_level:
            priority *= 0.9
    
    patient = Patient(
        patient_id=data.get('patient_id', f"P{int(datetime.now().timestamp())}"),
        respiratory_rate=data.get('respiratory_rate'),
        pulse=data.get('pulse'),
        systolic_bp=data.get('systolic_bp'),
        consciousness=data.get('consciousness', 'alert'),
        can_walk=data.get('can_walk', True),
        injury_type=json.dumps(data.get('injury_type', [])),
        injury_severity=data.get('injury_severity', 'moderate'),
        body_regions=json.dumps(data.get('body_regions', [])),
        estimated_age=data.get('estimated_age'),
        gender=data.get('gender'),
        triage_category=triage_result['category'],
        triage_score=triage_result['score'],
        priority=int(priority),
        notes=data.get('notes'),
        location=data.get('location'),
        medic=data.get('medic')
    )
    
    db.session.add(patient)
    db.session.commit()
    
    return jsonify({
        'patient_id': patient.patient_id,
        'category': triage_result['category'],
        'score': triage_result['score'],
        'priority': int(priority)
    })

@app.route('/api/patients')
@login_required
def get_patients():
    category = request.args.get('category')
    
    query = Patient.query
    if category:
        query = query.filter_by(triage_category=category)
    
    patients = query.filter(
        ~Patient.outcome.in_(['deceased', 'evacuated'])
    ).order_by(
        Patient.priority.desc(),
        Patient.timestamp.asc()
    ).all()
    
    return jsonify([{
        'id': p.id,
        'patient_id': p.patient_id,
        'timestamp': p.timestamp.isoformat(),
        'respiratory_rate': p.respiratory_rate,
        'pulse': p.pulse,
        'systolic_bp': p.systolic_bp,
        'consciousness': p.consciousness,
        'can_walk': p.can_walk,
        'injury_type': json.loads(p.injury_type),
        'injury_severity': p.injury_severity,
        'body_regions': json.loads(p.body_regions),
        'estimated_age': p.estimated_age,
        'gender': p.gender,
        'triage_category': p.triage_category,
        'triage_score': p.triage_score,
        'priority': p.priority,
        'treatment_started': p.treatment_started.isoformat() if p.treatment_started else None,
        'treatment_notes': p.treatment_notes,
        'outcome': p.outcome,
        'notes': p.notes,
        'location': p.location,
        'medic': p.medic
    } for p in patients])

@app.route('/api/patients/<int:patient_id>', methods=['PATCH'])
@login_required
def update_patient(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    data = request.get_json()
    
    if 'treatment_started' in data:
        patient.treatment_started = datetime.now() if data['treatment_started'] else None
    if 'treatment_notes' in data:
        patient.treatment_notes = data['treatment_notes']
    if 'outcome' in data:
        patient.outcome = data['outcome']
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/resources')
@login_required
def get_resources():
    resources = Resource.query.all()
    return jsonify([{
        'id': r.id,
        'resource_type': r.resource_type,
        'current_stock': r.current_stock,
        'critical_level': r.critical_level,
        'last_updated': r.last_updated.isoformat(),
        'location': r.location
    } for r in resources])

@app.route('/api/resources', methods=['POST'])
@login_required
def update_resource():
    data = request.get_json()
    
    resource = Resource.query.filter_by(resource_type=data['resource_type']).first()
    
    if resource:
        resource.current_stock = data['current_stock']
        resource.last_updated = datetime.now()
        if 'critical_level' in data:
            resource.critical_level = data['critical_level']
        if 'location' in data:
            resource.location = data['location']
    else:
        resource = Resource(
            resource_type=data['resource_type'],
            current_stock=data['current_stock'],
            critical_level=data.get('critical_level', 10),
            location=data.get('location')
        )
        db.session.add(resource)
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/stats')
@login_required
def get_stats():
    patients = Patient.query.all()
    active_patients = [p for p in patients if p.outcome not in ['deceased', 'evacuated']]
    
    stats = {
        'total': len(active_patients),
        'immediate': len([p for p in active_patients if p.triage_category == 'immediate']),
        'delayed': len([p for p in active_patients if p.triage_category == 'delayed']),
        'minimal': len([p for p in active_patients if p.triage_category == 'minimal']),
        'expectant': len([p for p in active_patients if p.triage_category == 'expectant']),
        'treated': len([p for p in patients if p.treatment_started]),
        'evacuated': len([p for p in patients if p.outcome == 'evacuated']),
        'deceased': len([p for p in patients if p.outcome == 'deceased'])
    }
    
    return jsonify(stats)

def initialize_database():
    """Initialize database with default data"""
    db.create_all()
    
    # Create default admin user if none exists
    if not User.query.first():
        admin = User(
            username='admin',
            password_hash=generate_password_hash('admin123'),
            email='admin@triage.local',
            name='System Administrator'
        )
        db.session.add(admin)
    
    # Initialize default resources if none exist
    if not Resource.query.first():
        default_resources = [
            {'resource_type': 'oxygen', 'current_stock': 50, 'critical_level': 10},
            {'resource_type': 'morphine', 'current_stock': 30, 'critical_level': 5},
            {'resource_type': 'blood_o_neg', 'current_stock': 20, 'critical_level': 3},
            {'resource_type': 'saline', 'current_stock': 100, 'critical_level': 20},
            {'resource_type': 'gauze', 'current_stock': 200, 'critical_level': 50},
            {'resource_type': 'antibiotics', 'current_stock': 40, 'critical_level': 8},
        ]
        
        for resource_data in default_resources:
            resource = Resource(**resource_data)
            db.session.add(resource)
    
    db.session.commit()

if __name__ == '__main__':
    initialize_database()
    app.run(debug=True, host='0.0.0.0', port=5000)
