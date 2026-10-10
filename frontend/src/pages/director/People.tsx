import { useSearchParams } from "react-router-dom";
import { Segment } from "../../ui";
import { Page } from "../../ui/Shell";
import { StudentList } from "./Students";
import { TeacherList } from "./Teachers";

export default function People() {
  const [p, setP] = useSearchParams();
  const tab = (p.get("tab") as "teachers" | "students") || "teachers";
  return (
    <Page title="Odamlar">
      <div className="col gap-12">
        <Segment value={tab} onChange={(v) => setP({ tab: v }, { replace: true })} items={[{ value: "teachers", label: "O'qituvchilar" }, { value: "students", label: "O'quvchilar" }]} />
        {tab === "teachers" ? <TeacherList /> : <StudentList />}
      </div>
    </Page>
  );
}
