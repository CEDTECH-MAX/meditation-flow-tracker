import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui-kit";
import {
  pickActive,
  useAttendance,
  useBlocks,
  useCohorts,
  useStudents,
  type Student,
} from "@/lib/admin-hooks";
import { createStudent, deleteStudent, updateStudent } from "@/lib/data.functions";
import { CLASSIFICATIONS, classificationLabel, genderLabel, summarise } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/students")({
  head: () => ({
    meta: [
      { title: "Students · Meditation Attendance" },
      {
        name: "description",
        content:
          "Add, edit and remove student accounts, reset passwords and review each student's meditation attendance percentage.",
      },
      { property: "og:title", content: "Student Management" },
      {
        property: "og:description",
        content: "Manage student accounts for the meditation attendance system.",
      },
    ],
  }),
  component: AdminStudents,
});

type FormState = {
  id?: string;
  full_name: string;
  student_number: string;
  email: string;
  password: string;
  photo_url: string;
  cohort_id: string;
  programme: string;
  intake_year: string;
};

const empty: FormState = {
  full_name: "",
  student_number: "",
  email: "",
  password: "",
  photo_url: "",
  cohort_id: "",
  programme: "",
  intake_year: "",
};

function AdminStudents() {
  const qc = useQueryClient();
  const { data: students, isLoading } = useStudents();
  const { data: cohorts } = useCohorts();
  const { data: blocks } = useBlocks();
  const block = pickActive(blocks);
  const { data: records } = useAttendance(block?.id ?? null);

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");

  const createFn = useServerFn(createStudent);
  const updateFn = useServerFn(updateStudent);
  const deleteFn = useServerFn(deleteStudent);

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["students"] });
    setForm(null);
    setConfirmDelete(null);
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (v: FormState) => {
      if (v.id) {
        return updateFn({
          data: {
            id: v.id,
            full_name: v.full_name,
            student_number: v.student_number,
            photo_url: v.photo_url,
            password: v.password,
            cohort_id: v.cohort_id || null,
            programme: v.programme,
            intake_year: v.intake_year ? Number(v.intake_year) : null,
          },
        });
      }
      return createFn({
        data: {
          full_name: v.full_name,
          student_number: v.student_number,
          email: v.email,
          password: v.password,
          photo_url: v.photo_url,
          cohort_id: v.cohort_id || null,
          programme: v.programme,
          intake_year: v.intake_year ? Number(v.intake_year) : null,
        },
      });
    },
    onSuccess: () => done("Student saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => done("Student removed"),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students ?? [])
      .filter((s) =>
        cohortFilter === "all"
          ? true
          : cohortFilter === "none"
            ? !s.cohort_id
            : s.cohort_id === cohortFilter,
      )
      .filter((s) => (classFilter === "all" ? true : s.classification === classFilter))
      .filter(
        (s) =>
          !q ||
          s.full_name.toLowerCase().includes(q) ||
          (s.student_number ?? "").toLowerCase().includes(q) ||
          (s.email ?? "").toLowerCase().includes(q),
      )
      .map((s) => ({
        student: s,
        summary: summarise(
          block,
          (records ?? []).filter((r) => r.student_id === s.id),
        ),
      }));
  }, [students, search, cohortFilter, classFilter, block, records]);

  if (isLoading) return <Spinner label="Loading students" />;

  return (
    <>
      <SectionTitle
        title="Students"
        subtitle={`${students?.length ?? 0} enrolled · attendance shown for ${block?.name ?? "no block"}`}
        action={<Button onClick={() => setForm({ ...empty })}>Add student</Button>}
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
          <Input
            placeholder="Search by name, number or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)} aria-label="Filter by cohort">
            <option value="all">All cohorts</option>
            <option value="none">Unassigned</option>
            {(cohorts ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter by classification"
          >
            <option value="all">All classifications</option>
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Number</th>
                  <th className="pb-2">Cohort</th>
                  <th className="pb-2">Classification</th>
                  <th className="pb-2">Gender</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Attendance</th>

                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ student, summary }) => (
                  <tr key={student.id} className="border-t border-border/60">
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        {student.photo_url ? (
                          <img
                            src={student.photo_url}
                            alt={student.full_name}
                            className="h-9 w-9 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-xs font-semibold text-secondary-foreground">
                            {student.full_name.slice(0, 1)}
                          </span>
                        )}
                        <span className="font-medium">{student.full_name}</span>
                      </div>
                    </td>
                    <td className="py-2">{student.student_number ?? "—"}</td>
                    <td className="py-2">
                      {(cohorts ?? []).find((c) => c.id === student.cohort_id)?.name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      <span className="block">{student.email ?? "—"}</span>
                      {student.internal_email ? (
                        <span className="block text-xs">{student.internal_email}</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <Badge
                        tone={
                          summary.status === "met"
                            ? "green"
                            : summary.status === "warning"
                              ? "amber"
                              : "red"
                        }
                      >
                        {summary.percentage}%
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm({
                              id: student.id,
                              full_name: student.full_name,
                              student_number: student.student_number ?? "",
                              email: student.email ?? "",
                              password: "",
                              photo_url: student.photo_url ?? "",
                              cohort_id: student.cohort_id ?? "",
                              programme: student.programme ?? "",
                              intake_year: student.intake_year ? String(student.intake_year) : "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirmDelete(student)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit student" : "Add student"}
      >
        {form ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label="Full name">
              <Input
                required
                minLength={2}
                maxLength={120}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </Field>
            <Field label="Student number">
              <Input
                required
                maxLength={40}
                value={form.student_number}
                onChange={(e) => setForm({ ...form, student_number: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                disabled={Boolean(form.id)}
                maxLength={255}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label={form.id ? "New password (leave blank to keep)" : "Temporary password"}>
              <Input
                type="password"
                required={!form.id}
                minLength={form.password ? 8 : undefined}
                maxLength={72}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="Cohort">
              <Select
                value={form.cohort_id}
                onChange={(e) => setForm({ ...form, cohort_id: e.target.value })}
              >
                <option value="">Unassigned</option>
                {(cohorts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Programme (optional)">
              <Input
                maxLength={120}
                value={form.programme}
                onChange={(e) => setForm({ ...form, programme: e.target.value })}
              />
            </Field>
            <Field label="Intake year (optional)">
              <Input
                type="number"
                min={2000}
                max={2100}
                value={form.intake_year}
                onChange={(e) => setForm({ ...form, intake_year: e.target.value })}
              />
            </Field>
            <Field label="Photo URL (optional)">
              <Input
                type="url"
                maxLength={500}
                value={form.photo_url}
                onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
              />
            </Field>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save student"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete student"
      >
        <p className="text-sm text-muted-foreground">
          Permanently delete <strong>{confirmDelete?.full_name}</strong> and all of their attendance
          records? This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
