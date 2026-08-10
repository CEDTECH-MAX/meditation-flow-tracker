import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAttendance,
  listBlocks,
  listCohorts,
  listStudents,
  getAuditLogs,
} from "@/lib/data.functions";
import type { AttendanceRecord, Block, Cohort } from "@/lib/attendance";

export { pickActive } from "@/lib/attendance";

export type Student = {
  id: string;
  full_name: string;
  student_number: string | null;
  email: string | null;
  photo_url: string | null;
  cohort_id: string | null;
  programme: string | null;
  intake_year: number | null;
  internal_email: string | null;
  gender: "male" | "female" | null;
  classification: "meditator" | "rising_siddha" | "siddha" | null;
};

export function useBlocks() {
  const fn = useServerFn(listBlocks);
  return useQuery<Block[]>({ queryKey: ["blocks"], queryFn: () => fn() as Promise<Block[]> });
}

export function useCohorts() {
  const fn = useServerFn(listCohorts);
  return useQuery<Cohort[]>({ queryKey: ["cohorts"], queryFn: () => fn() as Promise<Cohort[]> });
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

/**
 * Admin write with the shared feedback every admin screen expects: refresh the
 * affected queries, run any local cleanup, then a success or error toast.
 */
export function useAdminMutation<TData, TVars>({
  mutationFn,
  invalidate = [],
  success,
  onDone,
}: {
  mutationFn: (vars: TVars) => Promise<TData>;
  invalidate?: QueryKey[];
  success?: string | ((data: TData) => string);
  onDone?: (data: TData) => void;
}) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: (data) => {
      for (const queryKey of invalidate) qc.invalidateQueries({ queryKey });
      onDone?.(data);
      const message = typeof success === "function" ? success(data) : success;
      if (message) toast.success(message);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
