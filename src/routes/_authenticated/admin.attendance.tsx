import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button, Input, Modal, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/admin/blocks")({
  component: AdminBlocksPage,
});

function AdminBlocksPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);

  // Form states
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [cohort, setCohort] = useState("");
  const [pointsPerSession, setPointsPerSession] = useState(2);
  const [standardPoints, setStandardPoints] = useState(0);
  const [standardPercentage, setStandardPercentage] = useState(0);
  const [maxPoints, setMaxPoints] = useState(0);
  const [maxPercentage, setMaxPercentage] = useState(100);
  const [weeklyRequiredPoints, setWeeklyRequiredPoints] = useState(0);
  const [enableRounding, setEnableRounding] = useState(false);
  const [roundingPoints, setRoundingPoints] = useState(0);
  const [fridayPmOptional, setFridayPmOptional] = useState(false);
  const [saturdayOptional, setSaturdayOptional] = useState(false);

  // Fetch blocks
  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["admin-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveBlockMutation = useMutation({
    mutationFn: async (blockData: any) => {
      if (editingBlock) {
        const { error } = await supabase
          .from("blocks")
          .update(blockData)
          .eq("id", editingBlock.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blocks").insert([blockData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blocks"] });
      toast.success(editingBlock ? "Block updated successfully" : "Block created successfully");
      closeModal();
    },
    onError: (err: any) => {
      toast.error("Failed to save block: " + err.message);
    },
  });

  const openCreateModal = () => {
    setEditingBlock(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setWeeks(4);
    setCohort("");
    setPointsPerSession(2);
    setStandardPoints(0);
    setStandardPercentage(0);
    setMaxPoints(0);
    setMaxPercentage(100);
    setWeeklyRequiredPoints(0);
    setEnableRounding(false);
    setRoundingPoints(0);
    setFridayPmOptional(false);
    setSaturdayOptional(false);
    setIsModalOpen(true);
  };

  const openEditModal = (block: any) => {
    setEditingBlock(block);
    setName(block.name || "");
    setStartDate(block.start_date || "");
    setEndDate(block.end_date || "");
    setWeeks(block.weeks || 4);
    setCohort(block.cohort || "");
    setPointsPerSession(block.points_per_session ?? 2);
    setStandardPoints(block.standard_attendance_points || 0);
    setStandardPercentage(block.standard_attendance_percentage || 0);
    setMaxPoints(block.max_attendance_points || 0);
    setMaxPercentage(block.max_attendance_percentage || 100);
    setWeeklyRequiredPoints(block.weekly_required_points || 0);
    setEnableRounding(block.enable_rounding || false);
    setRoundingPoints(block.rounding_points || 0);
    setFridayPmOptional(block.friday_pm_optional || false);
    setSaturdayOptional(block.saturday_optional || false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBlock(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveBlockMutation.mutate({
      name,
      start_date: startDate,
      end_date: endDate,
      weeks: Number(weeks),
      cohort,
      points_per_session: Number(pointsPerSession),
      standard_attendance_points: Number(standardPoints),
      standard_attendance_percentage: Number(standardPercentage),
      max_attendance_points: Number(maxPoints),
      max_attendance_percentage: Number(maxPercentage),
      weekly_required_points: Number(weeklyRequiredPoints),
      enable_rounding: Boolean(enableRounding),
      rounding_points: Number(roundingPoints),
      friday_pm_optional: Boolean(fridayPmOptional),
      saturday_optional: Boolean(saturdayOptional),
      status: "upcoming",
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <SectionTitle>Meditation Blocks Management</SectionTitle>
        <Button onClick={openCreateModal}>Create New Block</Button>
      </div>

      {isLoading ? (
        <p>Loading blocks...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blocks.map((block: any) => (
            <div key={block.id} className="p-4 border rounded-xl bg-card shadow-sm space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{block.name}</h3>
                  <p className="text-sm text-muted-foreground">Cohort: {block.cohort || "General"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openEditModal(block)}>
                  Edit Block
                </Button>
              </div>
              <div className="text-xs space-y-1 pt-2 border-t">
                <p>Dates: {block.start_date} to {block.end_date} ({block.weeks} weeks)</p>
                <p>Points per Session: {block.points_per_session}</p>
                <p>Weekly Required Points: {block.weekly_required_points}</p>
                <p>Rounding: {block.enable_rounding ? `Enabled (${block.rounding_points} pts)` : "Disabled"}</p>
                <p>Optional: Friday PM ({block.friday_pm_optional ? "Yes" : "No"}), Saturday ({block.saturday_optional ? "Yes" : "No"})</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <form onSubmit={handleSubmit} className="space-y-4 p-2 max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold">{editingBlock ? "Edit Block" : "Create Block"}</h2>

          <div>
            <label className="text-sm font-medium">Block Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <label className="text-sm font-medium">Cohort</label>
            <Input value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="e.g. Cohort A" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Weeks</label>
              <Input type="number" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} required />
            </div>
            <div>
              <label className="text-sm font-medium">Points Per Session</label>
              <Input type="number" step="0.5" value={pointsPerSession} onChange={(e) => setPointsPerSession(Number(e.target.value))} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t pt-3">
            <div>
              <label className="text-sm font-medium">Standard Attendance Points</label>
              <Input type="number" value={standardPoints} onChange={(e) => setStandardPoints(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium">Standard Attendance %</label>
              <Input type="number" value={standardPercentage} onChange={(e) => setStandardPercentage(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium">Max Attendance Points</label>
              <Input type="number" value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium">Max Attendance %</label>
              <Input type="number" value={maxPercentage} onChange={(e) => setMaxPercentage(Number(e.target.value))} />
            </div>
          </div>

          <div className="border-t pt-3">
            <label className="text-sm font-medium">Weekly Required Points</label>
            <Input type="number" value={weeklyRequiredPoints} onChange={(e) => setWeeklyRequiredPoints(Number(e.target.value))} />
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Enable Rounding (Yes/No)</label>
              <input type="checkbox" checked={enableRounding} onChange={(e) => setEnableRounding(e.target.checked)} className="w-4 h-4" />
            </div>

            {enableRounding && (
              <div>
                <label className="text-sm font-medium">Rounding Points</label>
                <Input type="number" value={roundingPoints} onChange={(e) => setRoundingPoints(Number(e.target.value))} />
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Friday PM Optional</label>
              <input type="checkbox" checked={fridayPmOptional} onChange={(e) => setFridayPmOptional(e.target.checked)} className="w-4 h-4" />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Saturday Optional</label>
              <input type="checkbox" checked={saturdayOptional} onChange={(e) => setSaturdayOptional(e.target.checked)} className="w-4 h-4" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit">Save Block</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
