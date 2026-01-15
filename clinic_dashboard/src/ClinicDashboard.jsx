import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, Calendar, Phone, Activity, AlertCircle, ChevronRight, Clock, Mail } from 'lucide-react';
import './dashboard.css';
// --- INITIALIZATION ---
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const N8N_CANCEL_WEBHOOK = import.meta.env.VITE_N8N_CANCEL_WEBHOOK;
const N8N_DONE_WEBHOOK = import.meta.env.VITE_N8N_DONE_WEBHOOK;

const ClinicDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  // --- HELPER: Robust Date Parser ---
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.includes('-')) return new Date(dateStr);
    try {
      const clean = dateStr.replace(/(\d+)(st|nd|rd|th)/i, '$1');
      // Check if string already contains a year to avoid duplication errors
      const dateObj = /\d{4}/.test(clean) 
        ? new Date(clean) 
        : new Date(`${clean} ${new Date().getFullYear()}`);
      return isNaN(dateObj) ? null : dateObj;
    } catch (e) {
      return null;
    }
  };

  const fetchAppointments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('patient_name, email, phone_number, patient_symptoms, report_url, date, status, start_time')
      .eq('status', 'Scheduled');

    if (!error) {
      const sorted = (data || []).sort((a, b) => parseDate(a.date) - parseDate(b.date));
      setAppointments(sorted);
      if (sorted.length > 0 && !selectedDate) setSelectedDate(sorted[0].date);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAppointments(); }, []);

  const grouped = useMemo(() => {
    return appointments.reduce((acc, appt) => {
      acc[appt.date] = [...(acc[appt.date] || []), appt];
      return acc;
    }, {});
  }, [appointments]);

  // --- ACTION HANDLER: Unified Payload with AppointmentList.tsx ---
  const handleAction = async (appt, actionType) => {
    if (!window.confirm(`Mark as ${actionType}?`)) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: actionType })
      .match({ patient_name: appt.patient_name, date: appt.date, start_time: appt.start_time });

    if (!error) {
      const url = actionType === 'Completed' ? N8N_DONE_WEBHOOK : N8N_CANCEL_WEBHOOK;
      
      // The payload structure matches the n8n DateTime requirements
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          patient_name: appt.patient_name,
          email: appt.email,      // Patient's email from the fetched row
          date: appt.date,       // Raw date string for n8n format: "19 january 2026"
          time: appt.start_time, // Raw time string for n8n format: "9: 30 am"
          status: actionType,
          action_at: new Date().toISOString() 
        })
      }).catch(err => console.error("Webhook trigger failed", err));

      setAppointments(prev => prev.filter(a => a !== appt));
    } else {
      alert("Failed to update status in database.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Activity className="text-indigo-600" /> Clinic Dashboard
        </h1>
        <p className="text-slate-500">Active Schedule Management</p>
      </header>

      {loading ? (
        <div className="text-center py-20 animate-pulse">Loading schedule...</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
          <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
            <CheckCircle className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
          <p className="text-slate-500">No appointments currently scheduled.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar Date Selection */}
          <div className="space-y-2 overflow-y-auto max-h-[70vh]">
            {Object.keys(grouped).map(date => (
              <button 
                key={date} 
                onClick={() => setSelectedDate(date)}
                className={`w-full p-4 rounded-xl text-left border transition-all ${selectedDate === date ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-center">
                   <span className="font-semibold">{date}</span>
                   <span className={`text-xs px-2 py-0.5 rounded-full ${selectedDate === date ? 'bg-indigo-500' : 'bg-slate-100'}`}>
                     {grouped[date].length}
                   </span>
                </div>
              </button>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="md:col-span-3 space-y-4">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Appointments for {selectedDate}</h2>
            {grouped[selectedDate]?.map((appt, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 transition-hover hover:shadow-md">
                <div className="flex-grow">
                  <h3 className="text-xl font-bold text-slate-800 capitalize">{appt.patient_name}</h3>
                  <div className="flex flex-wrap gap-4 mt-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Phone size={14}/> {appt.phone_number}</span>
                    <span className="flex items-center gap-1.5"><Mail size={14}/> {appt.email}</span>
                  </div>
                  <div className="mt-3 bg-orange-50 p-2 rounded border border-orange-100">
                    <p className="text-xs font-bold text-orange-400 uppercase mb-1">Symptoms</p>
                    <p className="text-sm text-orange-800">{appt.patient_symptoms}</p>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
                  <div className="text-lg font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100 flex items-center gap-2">
                    <Clock size={18} /> {appt.start_time}
                  </div>
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={() => handleAction(appt, 'Cancelled')} 
                      className="flex-1 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => handleAction(appt, 'Completed')} 
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm shadow-indigo-100 transition-all active:scale-95"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicDashboard;
