import { CoursePicker } from "../../../course-picker";
import { getCourses, requireUser } from "../../../golf-data";

export default async function CoursesPage() {
  await requireUser("/play/courses");
  const courses = await getCourses();
  return <div className="page"><div className="page-intro"><span className="eyebrow">START A ROUND</span><h1>Where are<br /><em>you playing?</em></h1><p>Find a course to get your scorecard ready.</p></div><CoursePicker courses={courses} /></div>;
}
