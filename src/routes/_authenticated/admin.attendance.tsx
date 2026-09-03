import React, { useState } from 'react';

export function AttendanceMarkingView() {
  const [scores, setScores] = useState<Record<string, number>>({});

  const handleScoreChange = (studentId: string, value: number) => {
    setScores(prev => ({ ...prev, [studentId]: value }));
  };

  // Drag down or quick-fill support for session scoring
  const applyScoreToAll = (value: number, sessionKey: string) => {
    // Logic to update all visible rows for morning/afternoon sessions
  };

  return (
    <div className="p-6 space-y-6 bg-white rounded-lg shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-gray-900">Mark attendance</h2>
        <p className="text-sm text-gray-600">
          Each session is scored out of 2.0 points · drag a score down to fill the rest of the list
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-md border border-gray-100 text-sm">
        <span className="font-medium text-gray-700">Quick Actions:</span>
        <button onClick={() => applyScoreToAll(2.0, 'morning')} className="px-3 py-1 bg-green-100 text-green-800 rounded-full hover:bg-green-200">
          All morning 2.0
        </button>
        <button onClick={() => applyScoreToAll(0, 'morning')} className="px-3 py-1 bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300">
          All morning 0
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded border">
        <div><strong>2.0</strong> · Full programme attended</div>
        <div><strong>1.5</strong> · Arrived late</div>
        <div><strong>1.0</strong> · Did not do Asanas</div>
        <div><strong>0.5</strong> · Left within last 10 mins</div>
        <div><strong>0</strong> · Did not attend</div>
      </div>
    </div>
  );
}
