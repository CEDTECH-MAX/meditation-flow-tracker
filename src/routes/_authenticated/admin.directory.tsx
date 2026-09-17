import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  createDepartment,
  createStaff,
  deleteDepartment,
  deleteStaff,
  listDepartments,
  listStaff,
  resetStaffPassword,
  setPersonPhoto,
  setStaffActive,
  updateDepartment,
  updateStaff,
} from "@/lib/directory.functions";
import { PersonPhoto } from "@/components/PersonPhoto";
import { uploadPhoto } from "@/lib/photos";

export const Route = createFileRoute("/_authenticated/admin/directory")({
  head: () => ({
    meta: [
      { title: "Staff Directory · Attendance Management" },
      {
        name: "description",
        content:
          "Create departments and staff profiles for everyone working at the institute, each with their own internal mail account.",
      },
      { property: "og:title", content: "Staff directory" },
      {
        property: "og:description",
        content: "Departments and staff profiles for MII and MIU, kept separate per institution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDirectory,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function AdminDirectory() {
  const qc = useQueryClient();
  const depFn = useServerFn(listDepartments);
  const staffFn = useServerFn(listStaff);

  const departments = useQuery({ queryKey: ["departments"], queryFn: () => depFn() });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => staffFn() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments"] });
    qc.invalidateQueries({ queryKey: ["staff"] });
    qc.invalidateQueries({ queryKey: ["directory"] });
  };

  /* departments */
  const addDep = useMutation({
    mutationFn: useServerFn(createDepartment),
    onSuccess: () => {
      toast.success("Department added");
      setDepName("");
      setDepNote("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add the department"),
  });
  const editDep = useMutation({
    mutationFn: useServerFn(updateDepartment),
    onSuccess: () => {
      toast.success("Department updated");
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the department"),
  });
  const removeDep = useMutation({
    mutationFn: useServerFn(deleteDepartment),
    onSuccess: () => {
      toast.success("Department removed");
      invalidate();
    },
    onError: () => toast.error("Remove the people in this department first."),
  });

  const [depName, setDepName] = useState("");
  const [depNote, setDepNote] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(
    null,
  );

  /* staff */
  const addStaff = useMutation({
    mutationFn: useServerFn(createStaff),
    onSuccess: () => {
      toast.success("Staff profile created");
      setForm(emptyForm);
      setOpenStaff(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the profile"),
  });
  const editStaff = useMutation({
    mutationFn: useServerFn(updateStaff),
    onSuccess: () => {
      toast.success("Profile updated");
      setStaffEdit(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the profile"),
  });
  const activeStaff = useMutation({
    mutationFn: useServerFn(setStaffActive),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Could not change the profile"),
  });
  const resetPassword = useMutation({
    mutationFn: useServerFn(resetStaffPassword),
    onSuccess: () => {
      toast.success("Temporary password set");
      setReset(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not set the password"),
  });
  const removeStaff = useMutation({
    mutationFn: useServerFn(deleteStaff),
    onSuccess: () => {
      toast.success("Profile removed");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove the profile"),
  });

  const emptyForm = {
    first_name: "",
    surname: "",
    email: "",
    password: "",
    department_id: "",
    job_title: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [openStaff, setOpenStaff] = useState(false);
  const [staffEdit, setStaffEdit] = useState<
    { id: string; first_name: string; surname: string; department_id: string; job_title: string } | null
  >(null);
  const [reset, setReset] = useState<{ id: string; name: string; password: string } | null>(null);
  const [filter, setFilter] = useState("");

  const deps = departments.data ?? [];
  const rows = useMemo(() => {
    const list = staff.data ?? [];
    if (!filter) return list;
    return list.filter((p: any) => p.department_id === filter);
  }, [staff.data, filter]);

  function submitStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(form.email.trim())) {
      toast.error("Please enter a complete email address, for example thabo@example.com");
      return;
    }
    if (!form.department_id) {
      toast.error("Choose a department.");
      return;
    }
    addStaff.mutate({ data: { ...form, email: form.email.trim() } });
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Staff directory"
        subtitle="Departments and the people working at this institution. Each profile can sign in and use the internal mail."
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">Departments</h3>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            addDep.mutate({ data: { name: depName, description: depNote } });
          }}
        >
          <Field label="DEPARTMENT NAME">
            <Input
              required
              value={depName}
              onChange={(e) => setDepName(e.target.value)}
              placeholder="e.g. Meditation, Finance, Academics"
            />
          </Field>
          <Field label="NOTE (OPTIONAL)">
            <Input value={depNote} onChange={(e) => setDepNote(e.target.value)} placeholder="What this department does" />
          </Field>
          <Button type="submit" disabled={addDep.isPending} className="self-end">
            Add department
          </Button>
        </form>

        {departments.isLoading ? (
          <Spinner label="Loading departments" />
        ) : deps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments yet. Add your first one above.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {deps.map((d: any) => (
              <div
                key={d.id}
                className="glass-muted flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(staff.data ?? []).filter((p: any) => p.department_id === d.id).length} people
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() =>
                    setEditing({ id: d.id, name: d.name, description: d.description ?? "" })
                  }
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="text-xs text-destructive hover:underline"
                  onClick={() => removeDep.mutate({ data: { id: d.id } })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">People</h3>
          <div className="flex items-center gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All departments</option>
              {deps.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Button onClick={() => setOpenStaff(true)} disabled={deps.length === 0}>
              Add person
            </Button>
          </div>
        </div>

        {staff.isLoading ? (
          <Spinner label="Loading people" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {deps.length === 0
              ? "Add a department first, then add the people who work in it."
              : "Nobody here yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Department</th>
                  <th className="py-2">Role / title</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id} className="border-t border-border/50">
                    <td className="py-2 font-medium">{p.full_name}</td>
                    <td className="py-2 text-muted-foreground">{p.email}</td>
                    <td className="py-2">{p.department?.name ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{p.job_title || "—"}</td>
                    <td className="py-2">
                      {p.is_active === false ? (
                        <Badge tone="amber">Inactive</Badge>
                      ) : (
                        <Badge tone="green">Active</Badge>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setStaffEdit({
                              id: p.id,
                              first_name: (p.full_name ?? "").split(" ")[0] ?? "",
                              surname: (p.full_name ?? "").split(" ").slice(1).join(" "),
                              department_id: p.department_id ?? "",
                              job_title: p.job_title ?? "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReset({ id: p.id, name: p.full_name, password: "" })}
                        >
                          Password
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            activeStaff.mutate({
                              data: { id: p.id, is_active: p.is_active === false },
                            })
                          }
                        >
                          {p.is_active === false ? "Activate" : "Deactivate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeStaff.mutate({ data: { id: p.id } })}
                        >
                          Remove
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

      <Modal open={openStaff} onClose={() => setOpenStaff(false)} title="Add a person">
        <form className="space-y-3" onSubmit={submitStaff}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="FIRST NAME">
              <Input
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </Field>
            <Field label="SURNAME">
              <Input
                required
                value={form.surname}
                onChange={(e) => setForm({ ...form, surname: e.target.value })}
              />
            </Field>
          </div>
          <Field label="EMAIL ADDRESS">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="thabo@example.com"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="DEPARTMENT">
              <Select
                required
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              >
                <option value="">Choose a department</option>
                {deps.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="JOB TITLE (OPTIONAL)">
              <Input
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                placeholder="e.g. Lecturer"
              />
            </Field>
          </div>
          <Field label="TEMPORARY PASSWORD">
            <Input
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpenStaff(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addStaff.isPending}>
              {addStaff.isPending ? "Creating…" : "Create profile"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Rename department">
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              editDep.mutate({ data: editing });
            }}
          >
            <Field label="DEPARTMENT NAME">
              <Input
                required
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="NOTE (OPTIONAL)">
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!staffEdit} onClose={() => setStaffEdit(null)} title="Edit profile">
        {staffEdit ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              editStaff.mutate({ data: staffEdit });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="FIRST NAME">
                <Input
                  required
                  value={staffEdit.first_name}
                  onChange={(e) => setStaffEdit({ ...staffEdit, first_name: e.target.value })}
                />
              </Field>
              <Field label="SURNAME">
                <Input
                  required
                  value={staffEdit.surname}
                  onChange={(e) => setStaffEdit({ ...staffEdit, surname: e.target.value })}
                />
              </Field>
            </div>
            <Field label="DEPARTMENT">
              <Select
                required
                value={staffEdit.department_id}
                onChange={(e) => setStaffEdit({ ...staffEdit, department_id: e.target.value })}
              >
                <option value="">Choose a department</option>
                {deps.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="JOB TITLE (OPTIONAL)">
              <Input
                value={staffEdit.job_title}
                onChange={(e) => setStaffEdit({ ...staffEdit, job_title: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStaffEdit(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!reset} onClose={() => setReset(null)} title="Set a temporary password">
        {reset ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              resetPassword.mutate({ data: { id: reset.id, password: reset.password } });
            }}
          >
            <p className="text-sm text-muted-foreground">
              {reset.name} will use this password once, then change it from their own account.
            </p>
            <Field label="NEW TEMPORARY PASSWORD">
              <Input
                required
                minLength={8}
                value={reset.password}
                onChange={(e) => setReset({ ...reset, password: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setReset(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetPassword.isPending}>
                Set password
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
