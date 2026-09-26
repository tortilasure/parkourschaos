/** Course public API — section builders live in ./sections/ */
export * from "./courseCore";

// Register all section types (side-effect imports)
import "./sections/basic";
import "./sections/moving";
import "./sections/fragile";
import "./sections/spinners";
import "./sections/wallrun";
import "./sections/bounce";
import "./sections/zones";
import "./sections/vertical";
import "./sections/hazards";
import "./sections/combos";
import "./sections/lasers";
import "./sections/long";
import "./sections/special";

import { finalizeSections } from "./courseCore";
finalizeSections();
