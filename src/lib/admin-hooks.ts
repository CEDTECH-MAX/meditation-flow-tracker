import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAttendance, listBlocks, listStudents, getAuditLogs } from "@/lib/data.functions";
import type { AttendanceRecord, Block } from "@/lib/attendance";

export type Student = {
  id: string;
  full_name: string;
  student_number: string | null;
  email: string | null;
  photo_url: string | null;
};

export function useBlocks() {
  const fn = useServerFn(listBlocks);
  return useQuery<Block[]>({ queryKey: ["blocks"], queryFn: () => fn() as Promise<Block[]> });
}

export function useStudents() {
  const fn = useServerFn(listStudents);
  return useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fn() as Promise<Student[]> });
}

export function useAttendance(blockId: string | null) {
  const fn = useServerFn(listAttendance);
  return useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", blockId],
    enabled: Boolean(blockId),
    queryFn: () => fn({ data: { block_id: blockId! } }) as Promise<AttendanceRecord[]>,
  });
}

export function useAuditLogs() {
  const fn = useServerFn(getAuditLogs);
  return useQuery({ queryKey: ["audit"], queryFn: () => fn() });
}

export function pickActive(blocks: Block[] | undefined) {
  if (!blocks || blocks.length === 0) return null;
  return blocks.find((b) => b.status === "active") ?? blocks[0]!;
}
