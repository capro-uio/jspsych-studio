interface StudioExperiment {
  jsPsych: { data: { get: () => { values: () => unknown[] } } };
  finished?: boolean;
}

interface Window {
  studioExperiment: StudioExperiment;
}
