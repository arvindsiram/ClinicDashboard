import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  CheckCircle, 
  ChevronDown, 
  ChevronRight, 
  Phone, 
  Activity, 
  AlertCircle,
  Calendar,
  Clock
} from 'lucide-react';
import './dashboard.css';

// --- CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY; 

// Replace with your actual N8N Webhook URLs
const N8N_CANCEL_WEBHOOK = import.meta.env.N8N_CANCEL_WEBHOOK;
const N8N_DONE_WEBHOOK = import.meta.env.N8N_DONE_WEBHOOK;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ClinicDashboard = () => {
  const [groupedAppointments, setGroupedAppointments] = useState({});
  const [dates, setDates] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null); // Tracks which date accordion is open
  const [loading, setLoading] = useState(true);

  // --- HELPER: Robust Date Parser ---
  const parseAppointmentDate = (dateString) => {
    if (!dateString) return null;
    // Handle ISO/Standard dates
    if (dateString.includes('-')) return new Date(dateString);

    try {
      // Handle "14th Oct" format
      const cleanDate = dateString.replace(/(\d+)(st|nd|rd|th)/i, '$1'); 
      const currentYear = new Date().getFullYear();
      const dateObj = new Date(`${cleanDate} ${currentYear}`);
      
      // Handle year rollover (if date is > 6 months ago, assume it's next year)
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

  // --- FETCH DATA ---
  const fetchAppointments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('status', 'Scheduled') // Only fetch scheduled appointments
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching:', error);
    } else {
      groupAppointmentsByDate(data);
    }
    setLoading(false);
  };

  // --- GROUPING LOGIC ---
  const groupAppointmentsByDate = (data) => {
    const groups = {};
    
    data.forEach(appt => {
      const dateObj = parseAppointmentDate(appt.date);
      if (!dateObj) return;

      // Create a standard key for grouping (e.g., "Mon, Oct 14 2025")
      const dateKey = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric'
      });

      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateObj: dateObj, // Keep object for sorting
          appointments: []
        };
      }
      groups[dateKey].appointments.push(appt);
    });

    // Sort dates chronologically
    const sortedDates = Object.keys(groups).sort((a, b) => 
      groups[a].dateObj - groups[b].dateObj
    );

    // Sort appointments within each date by time (optional simple sort)
    sortedDates.forEach(date => {
      groups[date].appointments.sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

    setGroupedAppointments(groups);
    setDates(sortedDates);
    
    // Auto-expand the first date if available
    if (sortedDates.length > 0) {
      setExpandedDate(sortedDates[0]);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // --- ACTION HANDLER (Updated Payload Structure) ---
  const handleAction = async (appt, actionType) => {
    const confirmMessage = actionType === 'Completed' 
      ? "Are you sure? This will mark the appointment as Done." 
      : "Are you sure? This will CANCEL the appointment.";
    
    if (!window.confirm(confirmMessage)) return;

    // Optimistic UI Update: Remove from local state immediately
    const dateKey = Object.keys(groupedAppointments).find(key => 
      groupedAppointments[key].appointments.some(a => a.id === appt.id)
    );

    if (dateKey) {
      setGroupedAppointments(prev => ({
        ...prev,
        [dateKey]: {
          ...prev[dateKey],
          appointments: prev[dateKey].appointments.filter(a => a.id !== appt.id)
        }
      }));
    }

    try {
      // 1. Update Database
      const { error } = await supabase
        .from('appointments')
        .update({ status: actionType })
        .eq('id', appt.id);

      if (error) throw error;

      // 2. Trigger N8N Webhook with specific payload
      const webhookUrl = actionType === 'Completed' ? N8N_DONE_WEBHOOK : N8N_CANCEL_WEBHOOK;
      
      // Construct payload strictly matching your requirement
      // Note: mapping appt.email to the payload's 'email' field
      const payload = {
        appointment_id: appt.id,
        patient_name: appt.patient_name,
        email: appt.email, 
        reason: actionType === 'Cancelled' ? "Doctor cancelled via dashboard" : "Appointment Completed",
        [actionType === 'Cancelled' ? 'cancelled_at' : 'completed_at']: new Date().toISOString()
      };

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error("N8N Trigger Failed", err));

    } catch (err) {
      console.error("Error:", err);
      alert("Failed to update status in database.");
      fetchAppointments(); // Revert UI if failure
    }
  };

  const toggleDate = (date) => {
    setExpandedDate(expandedDate === date ? null : date);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Activity className="text-indigo-600" size={32} /> 
              Doctor's Dashboard
            </h1>
            <p className="text-slate-500 mt-2 ml-1">
              Manage your schedule
            </p>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400 animate-pulse">Loading schedule...</div>
        ) : dates.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
            <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
              <CheckCircle className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
            <p className="text-slate-500">No scheduled appointments found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dates.map((date) => {
              const group = groupedAppointments[date];
              const isExpanded = expandedDate === date;
              const hasAppointments = group.appointments.length > 0;

              // Skip rendering date header if all appointments inside were removed optimistically
              if (!hasAppointments) return null;

              return (
                <div key={date} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Date Header (Clickable) */}
                  <button 
                    onClick={() => toggleDate(date)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="text-indigo-500" size={20} />
                      <span className="text-lg font-bold text-slate-700">{date}</span>
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full">
                        {group.appointments.length}
                      </span>
                    </div>
                    {isExpanded ? <ChevronDown text-slate-400 /> : <ChevronRight text-slate-400 />}
                  </button>

                  {/* Appointments List (Collapsible) */}
                  {isExpanded && (
                    <div className="divide-y divide-slate-100">
                      {group.appointments.map((appt) => (
                        <div key={appt.id} className="p-5 hover:bg-slate-50 transition-colors flex flex-col md:flex-row items-start md:items-center gap-5">
                          
                          {/* Time */}
                          <div className="flex items-center gap-2 text-slate-600 min-w-[100px]">
                            <Clock size={18} className="text-indigo-400" />
                            <span className="text-lg font-semibold">{appt.start_time}</span>
                          </div>

                          {/* Patient Details */}
                          <div className="flex-grow">
                            <h3 className="text-lg font-bold text-slate-800 capitalize mb-1">
                              {appt.patient_name}
                            </h3>
                            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                              <span className="flex items-center gap-1">
                                <Phone size={14} /> {appt.phone_number}
                              </span>
                              {appt.patient_symptoms && (
                                <span className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100">
                                  <AlertCircle size={14} /> {appt.patient_symptoms}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3 w-full md:w-auto mt-2 md:mt-0">
                            <button
                              onClick={() => handleAction(appt, 'Cancelled')}
                              className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-lg transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleAction(appt, 'Completed')}
                              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-all active:scale-95"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDashboard;
