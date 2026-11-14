export const externalId = "df3ffa39-15be-4842-940a-7d470553a640";

export function coursePayload(count = 9) {
  return {
    id: externalId, course_name: "Test course", city: "Seattle", state: "WA",
    holes: count, par: count * 4,
    tees: [
      { tee_key: "blue-male", tee_name: "Blue", tee_color: "Blue", gender: "Male", course_rating: 70, slope: 120, par: count * 4, yardage: count * 300 },
      { tee_key: "blue-female", tee_name: "Blue", gender: "Female", course_rating: 72, slope: 125, par: count * 4, yardage: count * 300 },
      { tee_key: "red-female", tee_name: "Red", gender: "Female", course_rating: null, slope: null, yardage: count * 200 },
    ],
    holes_data: Array.from({ length: count }, (_, index) => ({
      number: index + 1, par: 4, handicap_index: count === 9 ? index * 2 + 1 : index + 1,
      yardages: { blue: 300, red: 200, web: 300 }, green: { center: null }, hazards: [],
    })),
  };
}

export function roundSnapshot(count = 9) {
  return parseRoundSnapshot({
    version: 1, course: { name: "Test course", location: "Seattle, WA" },
    scorecard: normalizeCourseScorecard(coursePayload(count), externalId, 42),
  });
}
import { normalizeCourseScorecard } from "../../app/course-scorecard.ts";
import { parseRoundSnapshot } from "../../app/round-snapshot.ts";
