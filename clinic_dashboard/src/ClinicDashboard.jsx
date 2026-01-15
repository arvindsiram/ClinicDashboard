import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, Calendar, Phone, Activity, AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext'; // Ensure this path matches your project structure
import './dashboard.css';

// --- CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Replace with your actual N8N Webhook URLs
const N8N_CANCEL_WEBHOOK = import.meta.env.VITE_N8N_CANCEL_WEBHOOK;
const N8N_DONE_WEBHOOK = import.meta.env.VITE_N8N_DONE_WEBHOOK;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ClinicDashboard = () => {
  const { user } = useAuth(); // Get logged-in user for the email field
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  // --- HELPER: Robust Date Parser ---
  const parseAppointmentDate = (dateString) => {
    if (!dateString) return null;
    // Handle standard ISO dates
    if (dateString.includes('-')) return new Date(dateString);

    try {
      // Handle "14th October" format
      const cleanDate = dateString.replace(/(\d+)(st|nd|rd|th)/i, '$1');
      const currentYear = new Date().getFullYear();
      const dateObj = new Date(`${cleanDate} ${currentYear}`);

      // Handle year rollover (if date is in the past, assume it's next year)
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

  // --- HELPER: Check if date is in the future (from today onwards) ---
  const isFutureDate = (dateString) => {
    const apptDate = parseAppointmentDate(dateString);
    if (!apptDate || isNaN(apptDate)) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day

    return apptDate >= today;
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
      // Filter for all future appointments
      const filtered = data.filter(appt => isFutureDate(appt.date));
      
      // Sort by actual date object
      const sorted = filtered.sort((a, b) =>
        parseAppointmentDate(a.date) - parseAppointmentDate(b.date)
      );
      
      setAppointments(sorted);
      
      // Default to selecting the first available date if not already selected
      if (sorted.length > 0 && !selectedDate) {
        setSelectedDate(sorted[0].date);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // --- GROUPING LOGIC ---
  // Returns an object like: { "12th Oct": [appt1, appt2], "14th Oct": [appt3] }
  const groupedAppointments = useMemo(() => {
    const groups = {};
    appointments.forEach(appt => {
      const dateKey = appt.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(appt);
    });
    return groups;
  }, [appointments]);

  // Get unique dates for the sidebar/top bar
  const availableDates = Object.keys(groupedAppointments);

  // --- ACTION HANDLER ---
  const handleAction = async (id, actionType, appt) => {
    const confirmMessage = actionType === 'Completed'
      ? "Mark this appointment as Done?"
      : "Are you sure you want to CANCEL this appointment?";

    if (!window.confirm(confirmMessage)) return;

    // Optimistic UI Update
    setAppointments(prev => prev.filter(a => a.id !== id));

    try {
      // 1. Update Database
      const { error } = await supabase
        .from('appointments')
        .update({ status: actionType })
        .eq('id', id);

      if (error) throw error;

      // 2. Trigger N8N Webhook (Exact body format requested)
      const webhookUrl = actionType === 'Completed' ? N8N_DONE_WEBHOOK : N8N_CANCEL_WEBHOOK;
      
      const payload = {
        appointment_id: appt.id,
        patient_name: appt.patient_name,
        email: user?.email || "unknown@clinic.com", // Fallback if user context is missing
        reason: actionType === 'Completed' ? "Appointment Completed" : "User cancelled via dashboard",
        cancelled_at: new Date().toISOString()
      };

      // Fire and forget fetch (or await if you want to track success)
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error("N8N Trigger Failed", err));

    } catch (err) {
      console.error("Error:", err);
      alert("Failed to update status.");
      fetchAppointments(); // Revert UI
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Activity className="text-indigo-600" size={32} />
            Doctor's Dashboard
          </h1>
          <p className="text-slate-500 mt-2">Manage upcoming patient visits</p>
        </header>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400 animate-pulse">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
            <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
              <CheckCircle className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No upcoming appointments</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* LEFT COLUMN: Date Selector */}
            <div className="md:col-span-1 space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">
                Select Date
              </h2>
              <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                {availableDates.map(date => {
                  const count = groupedAppointments[date].length;
                  const isActive = selectedDate === date;
                  
                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      className={`
                        flex items-center justify-between p-4 rounded-xl text-left transition-all whitespace-nowrap min-w-[160px] md:min-w-0
                        ${isActive 
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 transform scale-[1.02]' 
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <Calendar size={18} className={isActive ? 'text-indigo-200' : 'text-slate-400'} />
                        <span className="font-semibold">{date}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${isActive ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: Appointment List */}
            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  Appointments for <span className="text-indigo-600 underline decoration-wavy underline-offset-4">{selectedDate}</span>
                </h2>
                <span className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                  {groupedAppointments[selectedDate]?.length || 0} Patients
                </span>
              </div>

              <div className="space-y-4">
                {groupedAppointments[selectedDate]?.map((appt) => (
                  <div key={appt.id} className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    
                    {/* Time Badge */}
                    <div className="flex flex-row sm:flex-col items-center justify-center bg-slate-50 text-slate-700 rounded-lg p-3 min-w-[80px] border border-slate-100">
                      <Clock size={16} className="text-indigo-500 mb-1 hidden sm:block" />
                      <span className="text-lg font-bold text-indigo-900">{appt.start_time}</span>
                    </div>

                    {/* Patient Info */}
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-slate-800 truncate">
                          {appt.patient_name}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide">
                          Scheduled
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors cursor-pointer">
                          <Phone size={14} /> {appt.phone_number}
                        </span>
                        <span className="flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                          <AlertCircle size={14} /> {appt.patient_symptoms}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-0 border-slate-100">
                      <button
                        onClick={() => handleAction(appt.id, 'Cancelled', appt)}
                        className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAction(appt.id, 'Completed', appt)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-all active:scale-95"
                      >
                        Done <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDashboard;
