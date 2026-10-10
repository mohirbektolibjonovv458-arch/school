import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Paperclip, Pencil, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Announcement } from "../../lib/types";
import { Avatar, Badge, Button, Loader, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import AnnouncementForm, { AUDIENCES } from "./AnnouncementForm";

export default function AnnouncementDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const state = useApi<Announcement>(`announcements/${id}/`);
  const [edit, setEdit] = useState(false);
  const { confirm, el } = useConfirm();
  const del = async () => {
    if (!(await confirm("E'lonni o'chirasizmi?", { danger: true, ok: "O'chirish" }))) return;
    await api(`announcements/${id}/`, { method: "DELETE" });
    toast("E'lon o'chirildi");
    nav("/announcements", { replace: true });
  };
  return (
    <Page title="E'lon" back="/announcements">
      <Loader state={state}>
        {(a) => (
          <div className="card" style={{ maxWidth: 760, margin: "0 auto", padding: 20 }}>
            <div className="row gap-12">
              <Avatar name={a.author?.full_name || "Maktab"} url={a.author?.avatar_url} size={44} />
              <div className="grow">
                <div className="bold">{a.author?.full_name || "Maktab ma'muriyati"}</div>
                <div className="small subtle">{fmtDateTime(a.created_at)}</div>
              </div>
            </div>
            <div className="row wrap gap-8 mt-16">
              {a.important && <Badge tone="red" icon={<AlertCircle />}>Muhim</Badge>}
              <Badge tone="primary">{a.audience === "classes" ? a.class_names.join(", ") : AUDIENCES.find((x) => x.value === a.audience)?.label}</Badge>
            </div>
            <h1 className="h2 mt-12">{a.title}</h1>
            <p className="pre mt-12" style={{ fontSize: 16, lineHeight: 1.6 }}>{a.body}</p>
            {a.attachment_url && (
              <a href={a.attachment_url} target="_blank" rel="noreferrer" className="file-row mt-16">
                <div className="icon"><Paperclip /></div>
                <div className="grow ellipsis bold small">{a.attachment_name || "Ilova"}</div>
              </a>
            )}
            {a.can_edit && (
              <div className="row gap-8 mt-24">
                <Button variant="secondary" icon={<Pencil />} onClick={() => setEdit(true)}>Tahrirlash</Button>
                <Button variant="danger-soft" icon={<Trash2 />} onClick={del}>O'chirish</Button>
              </div>
            )}
            <AnnouncementForm open={edit} edit={a} onClose={() => setEdit(false)} onSaved={(x) => state.setData(x)} />
          </div>
        )}
      </Loader>
      {el}
    </Page>
  );
}
