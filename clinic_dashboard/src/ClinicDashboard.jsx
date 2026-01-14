import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, XCircle, Clock, Phone, Activity, AlertCircle } from 'lucide-react';

// --- CONFIGURATION ---
const SUPABASE_URL = import.meta.env.YOUR_SUPABASE_URL; 
const SUPABASE_KEY = import.meta.env.YOUR_SUPABASE_ANON_KEY; 

// Replace with your actual N8N Webhook URLs
const N8N_CANCEL_WEBHOOK = 'https://your-n8n-instance.com/webhook/cancel';
const N8N_DONE_WEBHOOK = 'https://your-n8n-instance.com/webhook/done';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ClinicDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- HELPER 1: Robust Date Parser ---
  const parseAppointmentDate = (dateString) => {
    if (!dateString) return null;
    if (dateString.includes('-')) return new Date(dateString);

    try {
      const cleanDate = dateString.replace(/(\d+)(st|nd|rd|th)/i, '$1'); 
      const currentYear = new Date().getFullYear();
      const dateObj = new Date(`${cleanDate} ${currentYear}`);
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      if (dateObj < sixMonthsAgo) {
        dateObj.setFullYear(currentYear + 1);
      }
      return dateObj;
    } catch (e) {
      console.error("Date parse error", e);
      return null;
    }
  };

  // --- HELPER 2: Next 20 Days Filter ---
  const isWithinNext20Days = (dateString) => {
    const apptDate = parseAppointmentDate(dateString);
    if (!apptDate || isNaN(apptDate)) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureLimit = new Date();
    futureLimit.setDate(today.getDate() + 20);

    return apptDate >= today && apptDate <= futureLimit;
  };

  // --- FETCH DATA ---
  const fetchAppointments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('status', 'Scheduled')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching:', error);
    } else {
      const filtered = data.filter(appt => isWithinNext20Days(appt.date));
      const sorted = filtered.sort((a, b) => 
        parseAppointmentDate(a.date) - parseAppointmentDate(b.date)
      );
      setAppointments(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // --- ACTION HANDLER (Updated N8N Payload) ---
  const handleAction = async (id, actionType, appointmentDetails) => {
    const confirmMessage = actionType === 'Completed' 
      ? "Are you sure? This will mark the appointment as Done." 
      : "Are you sure? This will CANCEL the appointment.";
    
    if (!window.confirm(confirmMessage)) return;

    // Optimistic UI Update
    setAppointments(prev => prev.filter(appt => appt.id !== id));

    try {
      // 1. Update Database
      const { error } = await supabase
        .from('appointments')
        .update({ status: actionType })
        .eq('id', id);

      if (error) throw error;

      // 2. Trigger N8N Workflow (Updated Structure)
      const webhookUrl = actionType === 'Completed' ? N8N_DONE_WEBHOOK : N8N_CANCEL_WEBHOOK;
      
      // Determine payload based on action type
      const payload = actionType === 'Cancelled' 
        ? {
            appointment_id: id,
            patient_name: appointmentDetails.patient_name,
            email: appointmentDetails.email, // Patient's email from DB
            reason: "Doctor cancelled via Clinic Dashboard",
            cancelled_at: new Date().toISOString()
          }
        : {
            // For "Completed", we keep a similar structure for consistency
            appointment_id: id,
            patient_name: appointmentDetails.patient_name,
            email: appointmentDetails.email,
            status: 'Completed',
            completed_at: new Date().toISOString()
          };

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error("N8N Trigger Failed", err));

    } catch (err) {
      console.error("Error:", err);
      alert("Failed to update status in database.");
      fetchAppointments(); // Revert UI if it failed
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Activity className="text-indigo-600" size={32} /> 
              Doctor's Dashboard
            </h1>
            <p className="text-slate-500 mt-2 ml-1">
              Upcoming schedule (Next 20 Days)
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Total Upcoming</div>
            <div className="text-3xl font-bold text-slate-800">{appointments.length}</div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400 animate-pulse">Loading schedule...</div>
        ) : appointments.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
            <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
              <CheckCircle className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
            <p className="text-slate-500">No appointments scheduled for the next 20 days.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {appointments.map((appt) => (
              <div key={appt.id} className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center gap-5">
                
                {/* Time & Date Badge */}
                <div className="flex flex-col items-center justify-center bg-indigo-50 text-indigo-700 rounded-lg p-3 min-w-[80px]">
                  <span className="text-xs font-bold uppercase tracking-wide">{appt.date}</span>
                  <span className="text-lg font-bold">{appt.start_time}</span>
                </div>

                {/* Patient Details */}
                <div className="flex-grow">
                  <h3 className="text-xl font-bold text-slate-800 capitalize mb-1">
                    {appt.patient_name}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <Phone size={14} /> {appt.phone_number}
                    </span>
                    <span className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100">
                      <AlertCircle size={14} /> {appt.patient_symptoms}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 w-full md:w-auto mt-2 md:mt-0">
                  <button
                    onClick={() => handleAction(appt.id, 'Cancelled', appt)}
                    className="flex-1 md:flex-none flex justify-center items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAction(appt.id, 'Completed', appt)}
                    className="flex-1 md:flex-none flex justify-center items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-all active:scale-95"
                  >
                    Done
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDashboard;
