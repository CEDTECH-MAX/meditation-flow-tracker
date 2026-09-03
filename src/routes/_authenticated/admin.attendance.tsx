import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  component: AdminAttendancePage,
});

function AdminAttendancePage() {
  const [selectedBlockId, setSelectedBlockId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedCohort, setSelectedCohort] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scores, setScores] = useState<Record<string, { morning: number; afternoon: number }>>({});
  
  const queryClient = useQueryClient();

  // Fetch active blocks
  const { data: blocks = [] } = useQuery({
    queryKey: ["admin-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocks").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0 && !selectedBlockId) {
        const active = data.find(b => b.status === "active") || data[0];
        setSelectedBlockId(active.id);
      }
      return data;
    },
  });

  // Fetch students and attendance for the selected block & date
  const { data: attendanceData, isLoading } = useQuery({
    queryKey: ["admin-attendance-grid", selectedBlockId, selectedDate, selectedCohort],
    queryFn: async () => {
      if (!selectedBlockId) return { students: [], records: [] };

      let studentQuery = supabase.from("profiles").select("*").order("full_name");
      if (selectedCohort !== "all") {
        studentQuery = studentQuery.eq("cohort", selectedCohort);
      }

      const [{ data: students, error: studentErr }, { data: records, error: recErr }] = await Promise.all([
        studentQuery,
        supabase.from("attendance_records").select("*").eq("block_id", selectedBlockId).eq("session_date", selectedDate),
      ]);

      if (studentErr) throw studentErr;
      if (recErr) throw recErr;

      return { students: students || [], records: records || [] };
    },
    enabled: !!selectedBlockId,
  });

  const activeBlock = blocks.find(b => b.id === selectedBlockId);

  // Mutation to save score
  const saveAttendanceMutation = useMutation({
    mutationFn: async ({ studentId, sessionType, points }: { studentId: string; sessionType: "morning" | "afternoon"; points: number }) => {
      const { error } = await supabase.from("attendance_records").upsert({
        student_id: studentId,
        block_id: selectedBlockId,
        session_date: selectedDate,
        session_type: sessionType,
        points: points,
      }, { onConflict: "student_id,block_id,session_date,session_type" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-attendance-grid"] });
    },
    onError: (err: any) => {
      toast.error("Failed to save score: " + err.message);
    },
  });

  const handleScoreChange = (studentId: string, sessionType: "morning" | "afternoon", val: string) => {
    const points = parseFloat(val);
    setScores(prev => ({
      ...prev,
      [studentId]: {
        morning: sessionType === "morning" ? points : (prev[studentId]?.morning ?? 2.0),
        afternoon: sessionType === "afternoon" ? points : (prev[studentId]?.afternoon ?? 2.0),
      }
    }));
    saveAttendanceMutation.mutate({ studentId, sessionType, points });
  };

  const applyQuickFill = (sessionType: "morning" | "afternoon", points: number) => {
    attendanceData?.students.forEach(student => {
      handleScoreChange(student.id, sessionType, points.toString());
    });
    toast.success(`Applied ${points} to all ${sessionType} sessions`);
  };

  const filteredStudents = attendanceData?.students.filter(s => 
    s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.student_number?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Mark attendance</h1>
        <p className="text-sm text-gray-600">
          Each session is scored out of 2.0 points · Use dropdowns or quick actions below
        </p>
      </div>

      {/* Control Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">Block</label>
          <Select value={selectedBlockId} onValueChange={setSelectedBlockId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select block" />
            </SelectTrigger>
            <SelectContent>
              {blocks.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">Session Date</label>
          <div className="mt-1">
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">Cohort</label>
          <Select value={selectedCohort} onValueChange={setSelectedCohort}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All cohorts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cohorts</SelectItem>
              <SelectItem value="MI21B">MI21B</SelectItem>
              <SelectItem value="Unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">Search Student</label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Name or student number" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Quick Actions & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-700 uppercase">Quick Actions:</span>
          <Button size="sm" variant="outline" onClick={() => applyQuickFill("morning", 2.0)} className="bg-green-50 text-green-700 hover:bg-green-100">
            All morning 2.0
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyQuickFill("afternoon", 2.0)} className="bg-green-50 text-green-700 hover:bg-green-100">
            All afternoon 2.0
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyQuickFill("morning", 0)} className="bg-gray-100 text-gray-700 hover:bg-gray-200">
            All morning 0
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyQuickFill("afternoon", 0)} className="bg-gray-100 text-gray-700 hover:bg-gray-200">
            All afternoon 0
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-600 bg-white px-3 py-2 rounded border">
          <span><strong>2.0</strong> Full</span>
          <span><strong>1.5</strong> Late</span>
          <span><strong>1.0</strong> No Asanas</span>
          <span><strong>0.5</strong> Left early</span>
          <span><strong>0</strong> Absent</span>
        </div>
      </div>

      {/* Student Attendance Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">
            {filteredStudents.length} students · full meditation day is 4.0 points (2.0 morning + 2.0 afternoon)
          </h3>
          <span className="text-xs text-gray-500">{selectedDate}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                <th className="p-4">Student</th>
                <th className="p-4 w-48">Morning (Max 2.0)</th>
                <th className="p-4 w-48">Afternoon (Max 2.0)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">Loading student attendance list...</td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">No students found matching your filters.</td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const studentRecords = attendanceData?.records.filter(r => r.student_id === student.id) || [];
                  const morningRec = studentRecords.find(r => r.session_type === "morning");
                  const afternoonRec = studentRecords.find(r => r.session_type === "afternoon");

                  const currentMorningVal = scores[student.id]?.morning ?? morningRec?.points ?? 2.0;
                  const currentAfternoonVal = scores[student.id]?.afternoon ?? afternoonRec?.points ?? 2.0;

                  return (
                    <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{student.full_name}</div>
                        <div className="text-xs text-gray-500">{student.student_number || student.email}</div>
                      </td>
                      <td className="p-4">
                        <Select 
                          value={currentMorningVal.toString()} 
                          onValueChange={(val) => handleScoreChange(student.id, "morning", val)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2.0 - Full attended</SelectItem>
                            <SelectItem value="1.5">1.5 - Arrived late</SelectItem>
                            <SelectItem value="1">1.0 - No Asanas</SelectItem>
                            <SelectItem value="0.5">0.5 - Left early</SelectItem>
                            <SelectItem value="0">0 - Did not attend</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-4">
                        <Select 
                          value={currentAfternoonVal.toString()} 
                          onValueChange={(val) => handleScoreChange(student.id, "afternoon", val)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2.0 - Full attended</SelectItem>
                            <SelectItem value="1.5">1.5 - Arrived late</SelectItem>
                            <SelectItem value="1">1.0 - No Asanas</SelectItem>
                            <SelectItem value="0.5">0.5 - Left early</SelectItem>
                            <SelectItem value="0">0 - Did not attend</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
