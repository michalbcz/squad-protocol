import { parseScenario, type Scenario } from '@sp/engine';
import bootcamp1 from './scenarios/bootcamp1.json';
import kestrel from './scenarios/kestrel.json';

export { WEAPONS } from './weapons';

export const SCENARIOS: Record<string, Scenario> = {
  bootcamp1: parseScenario(bootcamp1),
  kestrel: parseScenario(kestrel),
};
