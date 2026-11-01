// Keep one copy of observations also recorded as successful test results.
// Failed/partial observations remain inline, so diagnostic evidence is retained.
export function compactLiveReport(report) {
  const { caseObservations, ...result } = report;
  if (!caseObservations) return result;
  const observations = {};
  const references = { ...report.caseObservationRefs };
  const serializedResults = (report.tests || []).map(test => JSON.stringify(test.result));
  for (const [id, observation] of Object.entries(caseObservations)) {
    const index = serializedResults.indexOf(JSON.stringify(observation));
    if (index >= 0) references[id] = `tests[${index}].result`;
    else observations[id] = observation;
  }
  if (Object.keys(observations).length) result.caseObservations = observations;
  if (Object.keys(references).length) result.caseObservationRefs = references;
  return result;
}
