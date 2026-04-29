import type { PrototypeVersionId } from '../lib/prototypeVersion';
import { MAIN_NAV_ASSORTMENT_BODY_IDS } from '../mainNavModuleIds';
import { RebalancingTaskListScreen } from './rebalancing/RebalancingTaskListScreen';
import { RebalancingPrototypeV1 } from './rebalancing/prototypes/RebalancingPrototypeV1';
import { RebalancingPrototypeV1B } from './rebalancing/prototypes/RebalancingPrototypeV1B';
import { RebalancingPrototypeV2 } from './rebalancing/prototypes/RebalancingPrototypeV2';
import { RebalancingPrototypeV3 } from './rebalancing/prototypes/RebalancingPrototypeV3';
import { RebalancingPrototypeV4 } from './rebalancing/prototypes/RebalancingPrototypeV4';

type MainContentProps = {
  /** Primary sidebar selection — assortment UI only when Rebalancing (`refresh`) is active. */
  activeMainNavId?: string;
  /** Prototype variant from Layout rail — each value renders a module under `rebalancing/prototypes/`. */
  prototypeVersion?: PrototypeVersionId;
  /** After first task list visit, workspace is shown (persisted in localStorage). */
  rebalancingListIntroCompleted?: boolean;
  onEnterRebalancingWorkspace?: () => void;
};

function rebalancingWorkspaceForVersion(prototypeVersion: PrototypeVersionId) {
  switch (prototypeVersion) {
    case 'v1':
      return <RebalancingPrototypeV1 prototypeVersion={prototypeVersion} />;
    case 'v1b':
      return <RebalancingPrototypeV1B prototypeVersion={prototypeVersion} />;
    case 'v2':
      return <RebalancingPrototypeV2 prototypeVersion={prototypeVersion} />;
    case 'v3':
      return <RebalancingPrototypeV3 prototypeVersion={prototypeVersion} />;
    case 'v4':
      return <RebalancingPrototypeV4 prototypeVersion={prototypeVersion} />;
    default:
      return <RebalancingPrototypeV1 prototypeVersion="v1" />;
  }
}

export function MainContent({
  activeMainNavId = 'home',
  prototypeVersion = 'v1',
  rebalancingListIntroCompleted = true,
  onEnterRebalancingWorkspace,
}: MainContentProps) {
  if (!MAIN_NAV_ASSORTMENT_BODY_IDS.has(activeMainNavId)) {
    return (
      <main
        className="flex min-h-0 flex-1 flex-col bg-slate-50"
        data-prototype-version={prototypeVersion}
      >
        <div className="flex flex-1 flex-col min-h-0 items-center justify-center bg-white px-6 py-4">
          <p className="max-w-md text-center text-sm text-[#4b535c]">
            Select <span className="font-medium text-[#00050a]">Rebalancing</span> in the sidebar to open
            the assortment workspace.
          </p>
        </div>
      </main>
    );
  }

  if (!rebalancingListIntroCompleted) {
    return (
      <main
        className="relative left-0 flex min-h-0 min-w-0 w-full flex-1 flex-col bg-slate-50"
        data-prototype-version={prototypeVersion}
      >
        <RebalancingTaskListScreen
          onOpenTask={() => {
            onEnterRebalancingWorkspace?.();
          }}
        />
      </main>
    );
  }

  return rebalancingWorkspaceForVersion(prototypeVersion);
}
