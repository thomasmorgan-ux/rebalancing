import { useState, useRef, useEffect, useMemo, useId } from 'react';
import {
  Sparkles,
  X,
  Filter,
  Search,
  Settings,
  ArrowDownWideNarrow,
  ChevronDown,
  Check,
} from 'lucide-react';
import { AssortmentTable } from '../../AssortmentTable';
import { ProductTransfersBreadcrumb, ProductTransfersTable } from '../../ProductTransfersTable';
import { LocationsTable } from '../../LocationsTable';
import { LocationProductsDrillView } from '../../LocationProductsDrillView';
import { TripsTable } from '../../TripsTable';
import { CommitSuccessBanner } from '../../CommitSuccessBanner';
import { ConfirmCommitRevertModal, type ConfirmCommitRevertState } from '../../ConfirmCommitRevertModal';
import { EditAllocationPanel } from '../../EditAllocationPanel';
import { OptimisingIABanner } from '../../OptimisingIABanner';
import { SelectionActionBar } from '../../SelectionActionBar';
import {
  GenerateRecommendationsModal,
  type RecommendationMode,
} from '../../GenerateRecommendationsModal';
import { mockRows } from '../../../data/mockAssortment';
import type { LocationTableRow } from '../../../data/mockLocations';
import type { AssortmentRow } from '../../../types';
import { drillDropdownMenuItemHover } from '../../../lib/dropdownMenuClasses';
import {
  defaultTableColumnVisibility,
  type TableColumnVisibilityKey,
} from '../../../tableColumnCustomise';
import { ColumnCustomiseDrawer } from '../../ColumnCustomiseDrawer';
import { KpisPanel } from '../KpisPanel';
import { RebalancingWorkspaceSummaryBanner } from '../RebalancingWorkspaceSummaryBanner';
import type { PrototypeVersionId } from '../../../lib/prototypeVersion';

type FocusView = 'products' | 'locations' | 'trips';

type StatusTableFilter = 'all' | 'draft' | 'committed';

function filterRowsByFocusView(rows: AssortmentRow[], _view: FocusView): AssortmentRow[] {
  return rows;
}

const FILTERS_MENU_ITEMS = [
  'Sending locations',
  'Sending countries',
  'Receiving locations',
  'Receiving countries',
  'Departments',
  'Sub-departments',
  'Styles',
] as const;

/**
 * Table metric / sort-by selector — matches rebalancing workspace dropdown (design).
 * Order and labels follow product spec.
 */
const SORT_BY_OPTIONS = [
  { id: 'forecast', label: 'Forecast' },
  { id: 'l30d-sales', label: 'L30D sales' },
  { id: 'l7d-sales', label: 'L7D sales' },
  { id: 'locations', label: 'Locations' },
  { id: 'stock-after', label: 'Stock after' },
  { id: 'stock-before', label: 'Stock before' },
  { id: 'stockouts-after', label: 'Stockouts after' },
  { id: 'stockouts-before', label: 'Stockouts before' },
  { id: 'units-transferred-in', label: 'Units transferred in' },
  { id: 'units-transferred-out', label: 'Units transferred out' },
] as const;

type SortMetricId = (typeof SORT_BY_OPTIONS)[number]['id'];

const initRow = (r: AssortmentRow, isDraft = false): AssortmentRow => ({
  ...r,
  selected: false,
  hasPendingChanges: isDraft,
  lastCommittedSnapshot: {
    assortment: {
      assortedCount: r.assortment.assortedCount,
      totalCount: r.assortment.totalCount,
    },
    sumIa: r.sumIa,
    avgIa: r.avgIa,
  },
});

export type RebalancingPrototypeV1BProps = {
  prototypeVersion: PrototypeVersionId;
};

export function RebalancingPrototypeV1B({
  prototypeVersion,
}: RebalancingPrototypeV1BProps) {
  const [rows, setRows] = useState<AssortmentRow[]>(() =>
    mockRows.slice(0, 5).map((r) => initRow(r, false))
  );
  const [editAllocation, setEditAllocation] = useState<{
    rows: AssortmentRow[];
    openFrom: 'assortment' | 'initial-allocation';
  } | null>(null);
  const [confirmCommitRevert, setConfirmCommitRevert] = useState<ConfirmCommitRevertState | null>(null);
  const [focusView, setFocusView] = useState<FocusView>('products');
  const [statusTableFilter, setStatusTableFilter] = useState<StatusTableFilter>('all');
  const [tripType, setTripType] = useState<'rebalancing' | 'replenishment'>('rebalancing');
  const [includeZeroTransfers, setIncludeZeroTransfers] = useState(true);
  const [sortMetric, setSortMetric] = useState<SortMetricId>('stock-after');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortDescending, setSortDescending] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuId = useId();
  const [optimisingBannerVisible, setOptimisingBannerVisible] = useState(false);
  const [optimisingBannerDismissed, setOptimisingBannerDismissed] = useState(false);
  const [, setHasGeneratedRecommendations] = useState(false);
  const [recSuccessBanner, setRecSuccessBanner] = useState<{ groupsCount: number } | null>(null);
  const [commitSuccessBannerVisible, setCommitSuccessBannerVisible] = useState(false);
  const [generateRecModalOpen, setGenerateRecModalOpen] = useState(false);
  const [filtersMenuOpen, setFiltersMenuOpen] = useState(false);
  const [filtersSearchQuery, setFiltersSearchQuery] = useState('');
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  const filtersMenuId = useId();
  const [columnCustomiseOpen, setColumnCustomiseOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState(defaultTableColumnVisibility);
  const [kpisPanelOpen, setKpisPanelOpen] = useState(false);
  /** Products tab: row drill-down to per-location transfers for one assortment row */
  const [productTransfersDrillRowId, setProductTransfersDrillRowId] = useState<string | null>(null);
  /** Locations tab: row drill-down to per-location product list */
  const [locationProductsDrill, setLocationProductsDrill] = useState<LocationTableRow | null>(null);
  const optimisingToSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSuccessGroupsCountRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (optimisingToSuccessTimeoutRef.current) clearTimeout(optimisingToSuccessTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (productTransfersDrillRowId != null && !rows.some((r) => r.id === productTransfersDrillRowId)) {
      setProductTransfersDrillRowId(null);
    }
  }, [rows, productTransfersDrillRowId]);

  useEffect(() => {
    if (!filtersMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (filtersMenuRef.current?.contains(e.target as Node)) return;
      setFiltersMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [filtersMenuOpen]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSortMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (sortMenuRef.current?.contains(e.target as Node)) return;
      setSortMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [sortMenuOpen]);

  const filteredMenuItems = useMemo(() => {
    const q = filtersSearchQuery.trim().toLowerCase();
    if (!q) return [...FILTERS_MENU_ITEMS];
    return FILTERS_MENU_ITEMS.filter((label) => label.toLowerCase().includes(q));
  }, [filtersSearchQuery]);

  const sortMetricLabel = useMemo(
    () => SORT_BY_OPTIONS.find((o) => o.id === sortMetric)?.label ?? 'Stock after',
    [sortMetric]
  );

  const generateModalStats = useMemo(() => {
    const selected = rows.filter((r) => r.selected);
    const products = selected.reduce((s, r) => s + r.productGroup.productCount, 0);
    const locations = selected.reduce((s, r) => s + r.locationCluster.locationCount, 0);
    return {
      assortmentProducts: Math.max(products, 1),
      assortmentLocations: Math.max(locations, 1),
      iaOnlyProducts: Math.max(1, Math.round(products * 0.36)),
      iaOnlyLocations: Math.max(1, Math.round(locations * 0.6)),
    };
  }, [rows]);

  const runGenerateRecommendations = (mode: RecommendationMode) => {
    setOptimisingBannerVisible(true);
    setOptimisingBannerDismissed(false);
    setHasGeneratedRecommendations(true);
    setRows((prev) => {
      const selectedList = prev.filter((r) => r.selected);
      const groupsCount = selectedList.length;
      pendingSuccessGroupsCountRef.current = groupsCount;
      return prev.map((r) => {
        if (!r.selected) return r;
        const sumRec = 44;
        const avgRec =
          r.locationCluster.locationCount > 0
            ? sumRec / r.locationCluster.locationCount
            : r.avgIa;
        const base = {
          sumIaRecommendation: sumRec,
          avgIaRecommendation: avgRec,
          hasPendingChanges: true,
          lastCommittedSnapshot: r.lastCommittedSnapshot ?? {
            assortment: {
              assortedCount: r.assortment.assortedCount,
              totalCount: r.assortment.totalCount,
            },
            sumIa: r.sumIa,
            avgIa: r.avgIa,
          },
        };
        if (mode === 'ia-only') {
          return {
            ...r,
            ...base,
            assortmentRecommendationLabel: undefined,
          };
        }
        const recAssortCount = Math.min(
          r.assortment.assortedCount + 1,
          r.assortment.totalCount
        );
        const assortmentRecommendationLabel = `${recAssortCount}/${r.assortment.totalCount} Assorted`;
        return {
          ...r,
          ...base,
          assortmentRecommendationLabel,
        };
      });
    });
    if (optimisingToSuccessTimeoutRef.current) clearTimeout(optimisingToSuccessTimeoutRef.current);
    optimisingToSuccessTimeoutRef.current = setTimeout(() => {
      optimisingToSuccessTimeoutRef.current = null;
      setOptimisingBannerVisible(false);
      setRecSuccessBanner({ groupsCount: pendingSuccessGroupsCountRef.current });
    }, 3000);
  };

  useEffect(() => {
    if (!recSuccessBanner) return;
    const id = setTimeout(() => setRecSuccessBanner(null), 5000);
    return () => clearTimeout(id);
  }, [recSuccessBanner]);

  useEffect(() => {
    if (!commitSuccessBannerVisible) return;
    const id = setTimeout(() => setCommitSuccessBannerVisible(false), 5000);
    return () => clearTimeout(id);
  }, [commitSuccessBannerVisible]);

  const filteredRows = (() => {
    let f = filterRowsByFocusView(rows, focusView);
    if (statusTableFilter === 'draft') f = f.filter((r) => r.hasPendingChanges);
    else if (statusTableFilter === 'committed') f = f.filter((r) => !r.hasPendingChanges);
    return f;
  })();
  const tableRows = filteredRows;

  const productTransfersParentRow = useMemo(
    () =>
      productTransfersDrillRowId != null
        ? rows.find((r) => r.id === productTransfersDrillRowId) ?? null
        : null,
    [rows, productTransfersDrillRowId]
  );

  const updateRow = (id: string, patch: Partial<AssortmentRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const onSelectRow = (id: string, checked: boolean) => {
    updateRow(id, { selected: checked });
  };

  const onSelectAll = (checked: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  const onSumIaChange = (id: string, value: number) => {
    updateRow(id, { sumIa: value, hasPendingChanges: true });
  };

  const onAvgIaChange = (id: string, value: number) => {
    updateRow(id, { avgIa: value, hasPendingChanges: true });
  };

  const onAssort = (row: AssortmentRow) => {
    const { assortedCount, totalCount } = row.assortment;
    const next = Math.min(assortedCount + 1, totalCount);
    if (next === assortedCount) return;
    const assorted = `${next}/${totalCount} Assorted`;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== row.id) return r;
        const snapshot = r.lastCommittedSnapshot ?? {
          assortment: { assortedCount: r.assortment.assortedCount, totalCount: r.assortment.totalCount },
          sumIa: r.sumIa,
          avgIa: r.avgIa,
        };
        return {
          ...r,
          assortment: { ...r.assortment, assortedCount: next, assorted },
          hasPendingChanges: true,
          lastCommittedSnapshot: snapshot,
        };
      })
    );
  };

  const onUnassort = (row: AssortmentRow) => {
    const { assortedCount, totalCount } = row.assortment;
    const next = Math.max(assortedCount - 1, 0);
    if (next === assortedCount) return;
    const assorted = `${next}/${totalCount} Assorted`;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== row.id) return r;
        const snapshot = r.lastCommittedSnapshot ?? {
          assortment: { assortedCount: r.assortment.assortedCount, totalCount: r.assortment.totalCount },
          sumIa: r.sumIa,
          avgIa: r.avgIa,
        };
        return {
          ...r,
          assortment: { ...r.assortment, assortedCount: next, assorted },
          ...(next === 0
            ? { scheduledAssortmentStart: undefined, scheduledAssortmentFinish: undefined }
            : {}),
          hasPendingChanges: true,
          lastCommittedSnapshot: snapshot,
        };
      })
    );
  };

  /** Set each of the given rows to fully assorted (used by SelectionActionBar Assort button). */
  const onAssortSelection = (rowsToAssort: AssortmentRow[]) => {
    const applyAssort = (r: AssortmentRow): AssortmentRow => {
      const { totalCount } = r.assortment;
      const assorted = `${totalCount}/${totalCount} Assorted`;
      const snapshot = r.lastCommittedSnapshot ?? {
        assortment: { assortedCount: r.assortment.assortedCount, totalCount: r.assortment.totalCount },
        sumIa: r.sumIa,
        avgIa: r.avgIa,
      };
      return {
        ...r,
        assortment: { ...r.assortment, assortedCount: totalCount, assorted },
        hasPendingChanges: true,
        lastCommittedSnapshot: snapshot,
      };
    };
    setRows((prev) =>
      prev.map((r) => (rowsToAssort.some((x) => x.id === r.id) ? applyAssort(r) : r))
    );
    if (rowsToAssort.length >= 2) {
      setEditAllocation({
        rows: rowsToAssort.map(applyAssort),
        openFrom: 'assortment',
      });
    }
  };

  /** Set each of the given rows to unassorted (used by SelectionActionBar Unassort button). */
  const onUnassortSelection = (rowsToUnassort: AssortmentRow[]) => {
    setRows((prev) =>
      prev.map((r) => {
        if (!rowsToUnassort.some((x) => x.id === r.id)) return r;
        const { totalCount } = r.assortment;
        const assorted = `0/${totalCount} Assorted`;
        const snapshot = r.lastCommittedSnapshot ?? {
          assortment: { assortedCount: r.assortment.assortedCount, totalCount: r.assortment.totalCount },
          sumIa: r.sumIa,
          avgIa: r.avgIa,
        };
        return {
          ...r,
          assortment: { ...r.assortment, assortedCount: 0, assorted },
          scheduledAssortmentStart: undefined,
          scheduledAssortmentFinish: undefined,
          hasPendingChanges: true,
          lastCommittedSnapshot: snapshot,
        };
      })
    );
  };

  const onCommit = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        // When committing after recommendation, make the recommendation the new allocation and remove the pill
        const committedSum = r.sumIaRecommendation ?? r.sumIa;
        const committedAvg = r.avgIaRecommendation ?? r.avgIa;
        const snapshot = {
          assortment: {
            assortedCount: r.assortment.assortedCount,
            totalCount: r.assortment.totalCount,
          },
          sumIa: committedSum,
          avgIa: committedAvg,
        };
        return {
          ...r,
          sumIa: committedSum,
          avgIa: committedAvg,
          assortmentRecommendationLabel: undefined,
          sumIaRecommendation: undefined,
          avgIaRecommendation: undefined,
          committed: true,
          hasPendingChanges: false,
          lastCommittedSnapshot: snapshot,
        };
      })
    );
  };

  const onRevert = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id || !r.lastCommittedSnapshot) return r;
        const s = r.lastCommittedSnapshot;
        const assorted = `${s.assortment.assortedCount}/${s.assortment.totalCount} Assorted`;
        return {
          ...r,
          assortment: {
            ...r.assortment,
            assortedCount: s.assortment.assortedCount,
            totalCount: s.assortment.totalCount,
            assorted,
          },
          sumIa: s.sumIa,
          avgIa: s.avgIa,
          hasPendingChanges: false,
        };
      })
    );
  };
  return (
    <main
      className="flex min-h-0 min-w-0 w-full flex-1 flex-col bg-slate-50"
      data-prototype-version={prototypeVersion}
    >
      {optimisingBannerVisible && !optimisingBannerDismissed && (
        <div className="fixed left-1/2 top-[72px] z-[60] w-full max-w-2xl -translate-x-1/2">
          <OptimisingIABanner
            onDismiss={() => {
              setOptimisingBannerDismissed(true);
              setOptimisingBannerVisible(false);
              if (optimisingToSuccessTimeoutRef.current) {
                clearTimeout(optimisingToSuccessTimeoutRef.current);
                optimisingToSuccessTimeoutRef.current = null;
              }
              setRecSuccessBanner({ groupsCount: pendingSuccessGroupsCountRef.current });
            }}
          />
        </div>
      )}

      {commitSuccessBannerVisible && (
        <div className="fixed left-1/2 top-[72px] z-[60] w-full max-w-2xl -translate-x-1/2">
          <CommitSuccessBanner onDismiss={() => setCommitSuccessBannerVisible(false)} />
        </div>
      )}

      {recSuccessBanner && (
        <div
          className="fixed left-1/2 top-[72px] z-[60] w-full max-w-2xl -translate-x-1/2 flex items-center gap-3 rounded-[6px] border border-[#6864E6] p-4"
          style={{ borderWidth: '0.5px', backgroundColor: '#fbf4ff' }}
          role="status"
          aria-live="polite"
        >
          <Sparkles size={24} className="shrink-0 text-[#6864E6]" />
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <p className="text-lg font-medium leading-normal text-[#00050a]">
              Recommendations generated successfully
            </p>
            <p className="text-sm font-normal leading-normal text-[#00050a]">
              {recSuccessBanner.groupsCount} {recSuccessBanner.groupsCount === 1 ? 'group' : 'groups'} assorted
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRecSuccessBanner(null)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-[#00050a] transition-colors hover:bg-[#6864E6]/10"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div
        className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-y-auto bg-white px-6 pt-4 pb-12"
        data-walkthrough-root
      >
        <KpisPanel open={kpisPanelOpen} onClose={() => setKpisPanelOpen(false)} />

        {/* Top bar: tabs + trip controls; second row: search, sort, filter, settings */}
        <div
          className="flex w-full min-w-0 flex-col gap-3 pb-4"
          data-node-id="14764:268954"
        >
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div
              className="flex min-w-0 flex-wrap items-center gap-8"
              role="tablist"
              aria-label="Workspace sections"
            >
              {(
                [
                  { id: 'products' as const, label: 'Products' },
                  { id: 'locations' as const, label: 'Locations' },
                  { id: 'trips' as const, label: 'Trips' },
                ] as const
              ).map(({ id, label }) => {
                const active = focusView === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      if (id === 'products' && focusView === 'products' && productTransfersDrillRowId != null) {
                        setProductTransfersDrillRowId(null);
                        return;
                      }
                      setProductTransfersDrillRowId(null);
                      if (focusView === 'locations' && id !== 'locations') {
                        setLocationProductsDrill(null);
                      }
                      setFocusView(id);
                      setStatusTableFilter('all');
                    }}
                    className={`flex items-center justify-center border-b-2 px-1 py-3 text-sm transition-colors ${
                      active
                        ? 'border-[#2EB8C2] font-semibold text-[#00050a]'
                        : 'border-transparent font-normal text-[#4b535c] hover:text-[#00050a]'
                    }`}
                    data-name="tabs"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-['Inter',sans-serif] text-xs font-semibold leading-normal text-[#101828]">
                  Trip type:
                </span>
                <div
                  className="inline-flex items-center gap-3"
                  role="group"
                  aria-label="Trip type"
                >
                  <button
                    type="button"
                    aria-pressed={tripType === 'rebalancing'}
                    onClick={() => setTripType('rebalancing')}
                    className={`font-['Inter',sans-serif] text-xs leading-normal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0267FF] ${
                      tripType === 'rebalancing'
                        ? 'rounded border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-1.5 font-bold text-[#0F172A]'
                        : 'rounded border border-transparent bg-transparent px-2.5 py-1.5 font-normal text-[#6B7280] hover:text-[#374151]'
                    }`}
                  >
                    Rebalancing
                  </button>
                  <button
                    type="button"
                    aria-pressed={tripType === 'replenishment'}
                    onClick={() => setTripType('replenishment')}
                    className={`font-['Inter',sans-serif] text-xs leading-normal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0267FF] ${
                      tripType === 'replenishment'
                        ? 'rounded border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-1.5 font-bold text-[#0F172A]'
                        : 'rounded border border-transparent bg-transparent px-2.5 py-1.5 font-normal text-[#6B7280] hover:text-[#374151]'
                    }`}
                  >
                    Replenishment
                  </button>
                </div>
              </div>
              <div className="hidden h-6 w-px shrink-0 bg-[#e9eaeb] sm:block" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-normal text-[#4b535c] whitespace-nowrap">
                  Include zero transfers
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeZeroTransfers}
                  onClick={() => setIncludeZeroTransfers((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    includeZeroTransfers ? 'bg-[#0267FF]' : 'bg-[#e9eaeb]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      includeZeroTransfers ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <RebalancingWorkspaceSummaryBanner onOpenKpis={() => setKpisPanelOpen(true)} />

          <div
            className={`flex w-full min-w-0 flex-wrap items-center gap-2 ${productTransfersParentRow ? 'justify-between' : 'justify-end'}`}
          >
            {productTransfersParentRow ? (
              <ProductTransfersBreadcrumb
                parentRow={productTransfersParentRow}
                onBack={() => setProductTransfersDrillRowId(null)}
              />
            ) : null}
            <div
              className={`flex min-w-0 flex-wrap items-center gap-2 ${productTransfersParentRow ? 'shrink-0 justify-end' : 'flex-1 justify-end'}`}
            >
            <div className="relative min-w-0 max-w-full shrink" ref={sortMenuRef}>
              <div className="flex min-w-0 max-w-full items-stretch">
                <button
                  type="button"
                  id={`${sortMenuId}-trigger`}
                  aria-expanded={sortMenuOpen}
                  aria-haspopup="listbox"
                  aria-controls={sortMenuId}
                  onClick={() => setSortMenuOpen((o) => !o)}
                  className="flex h-8 min-h-8 min-w-[10rem] max-w-[min(100%,18rem)] flex-1 items-center justify-between gap-2 rounded-l border border-[#e9eaeb] border-r-0 bg-white pl-3 pr-2 text-left font-['Inter',sans-serif] text-sm text-[#101828] outline-none transition-colors hover:bg-slate-50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#0267FF] focus-visible:ring-offset-0"
                >
                  <span className="min-w-0 truncate">{sortMetricLabel}</span>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className={`shrink-0 text-[#101828] transition-transform ${sortMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                <div className="w-px shrink-0 self-stretch bg-[#e9eaeb]" aria-hidden />
                <button
                  type="button"
                  onClick={() => setSortDescending((d) => !d)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r border border-[#e9eaeb] border-l-0 bg-white text-[#101828] transition-colors hover:bg-slate-50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#0267FF] focus-visible:ring-offset-0"
                  aria-label={sortDescending ? 'Sort ascending' : 'Sort descending'}
                >
                  <ArrowDownWideNarrow
                    size={16}
                    strokeWidth={2}
                    className={sortDescending ? 'rotate-180' : ''}
                    aria-hidden
                  />
                </button>
              </div>
              {sortMenuOpen && (
                <div
                  id={sortMenuId}
                  role="listbox"
                  aria-labelledby={`${sortMenuId}-trigger`}
                  className="absolute left-0 top-[36px] z-50 flex max-h-[min(70vh,420px)] w-[min(100vw-2rem,320px)] min-w-[min(100%,280px)] flex-col gap-1 overflow-y-auto rounded-lg border border-[#e9eaeb] bg-white p-2 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12),0_4px_8px_-4px_rgba(15,23,42,0.08)]"
                >
                  {SORT_BY_OPTIONS.map((opt) => {
                    const selected = sortMetric === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setSortMetric(opt.id);
                          setSortMenuOpen(false);
                        }}
                        className={`flex h-9 w-full shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md bg-white px-3 py-0 text-left font-['Inter',sans-serif] text-[12px] font-medium capitalize leading-normal text-[#00050a] transition-colors ${drillDropdownMenuItemHover}`}
                      >
                        <span className="min-w-0 truncate">{opt.label}</span>
                        {selected ? (
                          <Check size={16} strokeWidth={2} className="shrink-0 text-[#6B7280]" aria-hidden />
                        ) : (
                          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setColumnCustomiseOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#e9eaeb] bg-white text-[#101828] transition-colors hover:bg-slate-50"
              aria-label="Settings"
            >
              <Settings size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded border border-[#e9eaeb] bg-white text-[#101828] transition-colors hover:bg-slate-50"
              aria-label="Search"
            >
              <Search size={16} strokeWidth={2} aria-hidden />
            </button>
            <div className="relative shrink-0" ref={filtersMenuRef}>
              <button
                type="button"
                id={`${filtersMenuId}-trigger`}
                aria-expanded={filtersMenuOpen}
                aria-haspopup="dialog"
                aria-controls={filtersMenuId}
                onClick={() => {
                  setFiltersMenuOpen((o) => {
                    const next = !o;
                    if (next) setFiltersSearchQuery('');
                    return next;
                  });
                }}
                className="flex h-8 shrink-0 items-center gap-2 rounded border border-[#e9eaeb] bg-white px-3 text-[#101828] transition-colors hover:bg-slate-50"
              >
                <Filter size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                <span className="font-['Inter',sans-serif] text-sm font-normal leading-none">
                  Filters
                </span>
              </button>
              {filtersMenuOpen && (
                <div
                  id={filtersMenuId}
                  role="dialog"
                  aria-labelledby={`${filtersMenuId}-trigger`}
                  className="absolute left-0 top-[36px] z-50 flex max-h-[min(70vh,420px)] w-[min(100vw-2rem,280px)] min-w-[260px] flex-col rounded-lg border border-[#e9eaeb] bg-white p-2 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12),0_4px_8px_-4px_rgba(15,23,42,0.08)]"
                >
                  <div className="relative shrink-0">
                    <Search
                      size={16}
                      strokeWidth={2}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={filtersSearchQuery}
                      onChange={(e) => setFiltersSearchQuery(e.target.value)}
                      placeholder="Search"
                      className="w-full rounded-lg border border-[#e9eaeb] bg-white py-2.5 pl-9 pr-3 font-['Inter',sans-serif] text-sm text-[#101828] placeholder:text-[#6B7280] outline-none focus:border-[#0267FF] focus:ring-1 focus:ring-[#0267FF]"
                      autoComplete="off"
                    />
                  </div>
                  <div className="my-2 h-px w-full shrink-0 bg-[#e9eaeb]" aria-hidden />
                  <div
                    className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
                    role="listbox"
                    aria-label="Filter categories"
                  >
                    {filteredMenuItems.length === 0 ? (
                      <p className="px-3 py-2 font-['Inter',sans-serif] text-[12px] leading-normal text-[#6B7280]">
                        No matches
                      </p>
                    ) : (
                      filteredMenuItems.map((label) => (
                        <button
                          key={label}
                          type="button"
                          role="option"
                          className={`flex h-9 w-full shrink-0 cursor-pointer items-center rounded-md bg-white px-3 py-0 text-left font-['Inter',sans-serif] text-[12px] font-medium capitalize leading-normal text-[#00050a] transition-colors ${drillDropdownMenuItemHover}`}
                          onClick={() => setFiltersMenuOpen(false)}
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>


        <div className="flex min-w-0 flex-col gap-0">
          <div className="min-w-0">
            {focusView === 'locations' ? (
              locationProductsDrill ? (
                <LocationProductsDrillView
                  location={locationProductsDrill}
                  onBack={() => setLocationProductsDrill(null)}
                />
              ) : (
                <LocationsTable onOpenLocationProducts={(row) => setLocationProductsDrill(row)} />
              )
            ) : focusView === 'trips' ? (
              <TripsTable />
            ) : productTransfersParentRow ? (
              <ProductTransfersTable
                parentRow={productTransfersParentRow}
                onBack={() => setProductTransfersDrillRowId(null)}
                showBreadcrumb={false}
              />
            ) : (
              <AssortmentTable
                rows={tableRows}
                columnVisibility={columnVisibility}
                onSelectRow={onSelectRow}
                onSelectAll={onSelectAll}
                onAssort={onAssort}
                onUnassort={onUnassort}
                onSumIaChange={onSumIaChange}
                onAvgIaChange={onAvgIaChange}
                onCommit={onCommit}
                onRevert={onRevert}
                onRowClick={(row) => setProductTransfersDrillRowId(row.id)}
                onEditRow={(row, openFrom) => {
                  const selected = rows.filter((r) => r.selected);
                  const rowsToEdit =
                    openFrom === 'initial-allocation' && selected.length >= 2
                      ? selected
                      : [row];
                  setEditAllocation({ rows: rowsToEdit, openFrom });
                }}
                onRequestCommit={(row) => {
                  const selected = rows.filter((r) => r.selected);
                  const rowsToCommit = selected.length > 0 ? selected : [row];
                  setConfirmCommitRevert({ action: 'commit', rows: rowsToCommit });
                }}
                onRequestRevert={(row) => {
                  const selected = rows.filter((r) => r.selected && r.hasPendingChanges);
                  const rowsToRevert =
                    selected.some((r) => r.id === row.id) && selected.length > 0
                      ? selected
                      : [row];
                  setConfirmCommitRevert({ action: 'revert', rows: rowsToRevert });
                }}
              />
            )}
          </div>
        </div>
      </div>

      <ColumnCustomiseDrawer
        open={columnCustomiseOpen}
        onClose={() => setColumnCustomiseOpen(false)}
        visibility={columnVisibility}
        onChange={(key: TableColumnVisibilityKey, visible: boolean) =>
          setColumnVisibility((prev) => ({ ...prev, [key]: visible }))
        }
      />

      {editAllocation && (
        <EditAllocationPanel
          rows={editAllocation.rows.map((r) => rows.find((x) => x.id === r.id) ?? r)}
          openFrom={editAllocation.openFrom}
          onClose={() => setEditAllocation(null)}
          onSumIaChange={onSumIaChange}
          onAvgIaChange={onAvgIaChange}
          onAssort={onAssort}
          onUnassort={onUnassort}
          onAssortToMax={(row) => onAssortSelection([row])}
          onUnassortToZero={(row) => onUnassortSelection([row])}
          onScheduledAssortmentScheduleChange={(rowId, field, value) =>
            setRows((prev) =>
              prev.map((r) =>
                r.id === rowId
                  ? {
                      ...r,
                      ...(field === 'start'
                        ? { scheduledAssortmentStart: value || undefined }
                        : { scheduledAssortmentFinish: value || undefined }),
                    }
                  : r
              )
            )
          }
          onAssortmentCancelDraft={() => {
            if (!editAllocation || editAllocation.openFrom !== 'assortment') return;
            editAllocation.rows.forEach((r) => onRevert(r.id));
            setEditAllocation(null);
          }}
        />
      )}

      <ConfirmCommitRevertModal
        open={confirmCommitRevert != null}
        state={confirmCommitRevert}
        variant="slideout"
        onConfirm={(commitRowIds) => {
          if (confirmCommitRevert) {
            if (confirmCommitRevert.action === 'commit') {
              const ids = commitRowIds ?? confirmCommitRevert.rows.map((r) => r.id);
              ids.forEach((id) => onCommit(id));
              setCommitSuccessBannerVisible(true);
            } else {
              (confirmCommitRevert.rows ?? []).forEach((r) => onRevert(r.id));
            }
          }
        }}
        onClose={() => setConfirmCommitRevert(null)}
      />

      <GenerateRecommendationsModal
        open={generateRecModalOpen}
        onClose={() => setGenerateRecModalOpen(false)}
        onGenerate={runGenerateRecommendations}
        assortmentProducts={generateModalStats.assortmentProducts}
        assortmentLocations={generateModalStats.assortmentLocations}
        iaOnlyProducts={generateModalStats.iaOnlyProducts}
        iaOnlyLocations={generateModalStats.iaOnlyLocations}
      />

      {focusView !== 'locations' &&
        focusView !== 'trips' &&
        productTransfersDrillRowId === null &&
        locationProductsDrill === null && (
        <SelectionActionBar
          selectedRows={rows.filter((r) => r.selected) ?? []}
          onClearSelection={() => setRows((prev) => prev.map((r) => ({ ...r, selected: false })))}
          onGenerateRecommendations={() => setGenerateRecModalOpen(true)}
          onOpenInitialAllocation={(rowsToEdit) => setEditAllocation({ rows: rowsToEdit, openFrom: 'initial-allocation' })}
          onAssortSelection={onAssortSelection}
          onUnassortSelection={onUnassortSelection}
          onAssort={onAssort}
          onUnassort={onUnassort}
          onRequestCommit={(selected) => setConfirmCommitRevert({ action: 'commit', rows: selected })}
          onRequestRevert={(selected) => setConfirmCommitRevert({ action: 'revert', rows: selected })}
          onCommit={onCommit}
          onRevert={onRevert}
        />
      )}
    </main>
  );
}
