import { parseScenario, type Scenario } from '@sp/engine';
import bootcamp1 from './scenarios/bootcamp1.json';
import bootcamp2 from './scenarios/bootcamp2.json';
import bootcamp3 from './scenarios/bootcamp3.json';
import bootcamp4 from './scenarios/bootcamp4.json';
import kestrel from './scenarios/kestrel.json';

export { WEAPONS } from './weapons';

export const SCENARIOS: Record<string, Scenario> = {
  bootcamp1: parseScenario(bootcamp1),
  bootcamp2: parseScenario(bootcamp2),
  bootcamp3: parseScenario(bootcamp3),
  bootcamp4: parseScenario(bootcamp4),
  kestrel: parseScenario(kestrel),
};
