"use client";

import { useId, type ReactNode } from "react";

import { formatShortDate } from "@/lib/mvp/travel-dates";
import type { DestinationSuggestion } from "@/lib/mvp/types";

type Mode = "discovery" | "standard";

export type PlannerFormText = {
  modeStandard: string;
  modeDiscovery: string;
  describeTrip: string;
  discoveryPlaceholder: string;
  budget: string;
  minDays: string;
  maxDays: string;
  direction: string;
  destinationPlaceholder: string;
  destinationSearching: string;
  destinationEmpty: string;
  sharedTitle: string;
  origin: string;
  originPlaceholder: string;
  travelStart: string;
  nights: string;
  travelers: string;
  rooms: string;
  roomSingle: string;
  roomFew: string;
  roomMany: string;
  travelersShort: string;
  quickPreview: string;
  showStayFlights: string;
  loadingPlan: string;
  refreshFlow: string;
  withChildren: string;
  childrenCount: string;
  infants: string;
  heroTitle: string;
};

export type PlannerFormProps = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  query: string;
  setQuery: (value: string) => void;
  destinationHint: string;
  setDestinationHint: (value: string) => void;
  originCity: string;
  setOriginCity: (value: string) => void;
  travelStartDate: string;
  setTravelStartDate: (value: string) => void;
  checkOutDate: string;
  setTravelEndDate: (value: string) => void;
  travelers: number;
  setTravelers: (value: number) => void;
  rooms: number;
  setRooms: (value: number) => void;
  budget: number;
  setBudget: (value: number) => void;
  durationMin: number;
  setDurationMin: (value: number) => void;
  durationMax: number;
  setDurationMax: (value: number) => void;
  withChildren: boolean;
  setWithChildren: (value: boolean) => void;
  childrenCount: number;
  setChildrenCount: (value: number) => void;
  infants: number;
  setInfants: (value: number) => void;
  destinationSuggestions: DestinationSuggestion[];
  isSuggestingDestinations: boolean;
  destinationSuggestionsOpen: boolean;
  onDestinationLookup: (value: string) => void;
  onDestinationFocus: () => void;
  onDestinationSelect: (suggestion: DestinationSuggestion) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
  onModeSelect?: (mode: Mode) => void;
  text: PlannerFormText;
  dateLocale: string;
  discoveryPresets: readonly string[];
  standardPresets: readonly string[];
  compact?: boolean;
};

export function PlannerForm(props: PlannerFormProps) {
  return props.compact ? <CompactForm {...props} /> : <FullForm {...props} />;
}

function FullForm(props: PlannerFormProps) {
  const {
    mode,
    setMode,
    query,
    setQuery,
    destinationHint,
    setDestinationHint,
    originCity,
    setOriginCity,
    travelStartDate,
    setTravelStartDate,
    checkOutDate,
    setTravelEndDate,
    travelers,
    setTravelers,
    rooms,
    setRooms,
    budget,
    setBudget,
    durationMin,
    setDurationMin,
    durationMax,
    setDurationMax,
    withChildren,
    setWithChildren,
    childrenCount,
    setChildrenCount,
    infants,
    setInfants,
    destinationSuggestions,
    isSuggestingDestinations,
    destinationSuggestionsOpen,
    onDestinationLookup,
    onDestinationFocus,
    onDestinationSelect,
    onSubmit,
    loading,
    error,
    onModeSelect,
    text,
    dateLocale,
    discoveryPresets,
    standardPresets,
  } = props;

  const handleModeSelect = (next: Mode) => {
    setMode(next);
    onModeSelect?.(next);
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-emerald-900/10 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-emerald-950 sm:text-3xl">{text.heroTitle}</h1>

        <div className="inline-flex rounded-full border border-emerald-900/10 bg-white/84 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleModeSelect("standard")}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              mode === "standard" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            {text.modeStandard}
          </button>
          <button
            type="button"
            onClick={() => handleModeSelect("discovery")}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              mode === "discovery" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            {text.modeDiscovery}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(247,252,249,0.98),rgba(235,247,239,0.94))] p-4 sm:p-5">
          {mode === "discovery" ? (
            <div className="space-y-4">
              <Field label={text.describeTrip}>
                <Textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={text.discoveryPlaceholder}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {discoveryPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setQuery(preset)}
                    className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={text.budget}>
                  <Input
                    type="number"
                    value={budget}
                    onChange={(event) => setBudget(Number(event.target.value) || 0)}
                  />
                </Field>
                <Field label={text.minDays}>
                  <Input
                    type="number"
                    min={2}
                    max={31}
                    value={durationMin}
                    onChange={(event) => setDurationMin(Number(event.target.value) || 2)}
                  />
                </Field>
                <Field label={text.maxDays}>
                  <Input
                    type="number"
                    min={2}
                    max={31}
                    value={durationMax}
                    onChange={(event) => setDurationMax(Number(event.target.value) || 2)}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {standardPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDestinationHint(preset)}
                    className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DestinationAutocompleteField
                  label={text.direction}
                  value={destinationHint}
                  onChange={onDestinationLookup}
                  onFocus={onDestinationFocus}
                  onSelect={onDestinationSelect}
                  suggestions={destinationSuggestions}
                  isLoading={isSuggestingDestinations}
                  isOpen={destinationSuggestionsOpen}
                  placeholder={text.destinationPlaceholder}
                  loadingLabel={text.destinationSearching}
                  emptyLabel={text.destinationEmpty}
                />
                <Field label={text.budget}>
                  <Input
                    type="number"
                    value={budget}
                    onChange={(event) => setBudget(Number(event.target.value) || 0)}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold text-emerald-950">{text.sharedTitle}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={text.origin}>
              <Input
                value={originCity}
                onChange={(event) => setOriginCity(event.target.value)}
                placeholder={text.originPlaceholder}
              />
            </Field>
            <Field label={text.travelStart}>
              <Input
                type="date"
                value={travelStartDate}
                onChange={(event) => setTravelStartDate(event.target.value)}
              />
            </Field>
            <Field label={text.nights}>
              <Input
                type="date"
                value={checkOutDate}
                min={travelStartDate}
                onChange={(event) => setTravelEndDate(event.target.value)}
              />
            </Field>
            <Field label={text.travelers}>
              <Input
                type="number"
                min={1}
                max={8}
                value={travelers}
                onChange={(event) => setTravelers(Number(event.target.value) || 1)}
              />
            </Field>
            <Field label={text.rooms}>
              <Input
                type="number"
                min={1}
                max={5}
                value={rooms}
                onChange={(event) => setRooms(Number(event.target.value) || 1)}
              />
            </Field>
            <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                {text.quickPreview}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-950">
                {formatShortDate(travelStartDate, dateLocale)} - {formatShortDate(checkOutDate, dateLocale)}
              </p>
              <p className="mt-1 text-sm text-emerald-900/76">
                {travelers} {text.travelersShort} / {rooms}{" "}
                {rooms === 1 ? text.roomSingle : rooms < 5 ? text.roomFew : text.roomMany}
              </p>
            </div>
          </div>

          <ChildrenToggle
            withChildren={withChildren}
            setWithChildren={setWithChildren}
            childrenCount={childrenCount}
            setChildrenCount={setChildrenCount}
            infants={infants}
            setInfants={setInfants}
            text={text}
          />

          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="mt-5 w-full rounded-full bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(21,128,61,0.22)] transition hover:bg-emerald-800 disabled:opacity-70"
          >
            {loading ? text.loadingPlan : text.showStayFlights}
          </button>
          {error ? (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function CompactForm(props: PlannerFormProps) {
  const {
    destinationHint,
    originCity,
    setOriginCity,
    travelStartDate,
    setTravelStartDate,
    checkOutDate,
    setTravelEndDate,
    travelers,
    setTravelers,
    rooms,
    setRooms,
    withChildren,
    setWithChildren,
    childrenCount,
    setChildrenCount,
    infants,
    setInfants,
    destinationSuggestions,
    isSuggestingDestinations,
    destinationSuggestionsOpen,
    onDestinationLookup,
    onDestinationFocus,
    onDestinationSelect,
    onSubmit,
    loading,
    error,
    text,
  } = props;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DestinationAutocompleteField
          label={text.direction}
          value={destinationHint}
          onChange={onDestinationLookup}
          onFocus={onDestinationFocus}
          onSelect={onDestinationSelect}
          suggestions={destinationSuggestions}
          isLoading={isSuggestingDestinations}
          isOpen={destinationSuggestionsOpen}
          placeholder={text.destinationPlaceholder}
          loadingLabel={text.destinationSearching}
          emptyLabel={text.destinationEmpty}
        />
        <Field label={text.origin}>
          <Input value={originCity} onChange={(event) => setOriginCity(event.target.value)} />
        </Field>
        <Field label={text.travelStart}>
          <Input
            type="date"
            value={travelStartDate}
            onChange={(event) => setTravelStartDate(event.target.value)}
          />
        </Field>
        <Field label={text.nights}>
          <Input
            type="date"
            value={checkOutDate}
            min={travelStartDate}
            onChange={(event) => setTravelEndDate(event.target.value)}
          />
        </Field>
        <Field label={text.travelers}>
          <Input
            type="number"
            min={1}
            max={8}
            value={travelers}
            onChange={(event) => setTravelers(Number(event.target.value) || 1)}
          />
        </Field>
        <Field label={text.rooms}>
          <Input
            type="number"
            min={1}
            max={5}
            value={rooms}
            onChange={(event) => setRooms(Number(event.target.value) || 1)}
          />
        </Field>
      </div>

      <ChildrenToggle
        withChildren={withChildren}
        setWithChildren={setWithChildren}
        childrenCount={childrenCount}
        setChildrenCount={setChildrenCount}
        infants={infants}
        setInfants={setInfants}
        text={text}
      />

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="w-full rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800 disabled:opacity-70"
      >
        {loading ? text.loadingPlan : text.refreshFlow}
      </button>
      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

function ChildrenToggle({
  withChildren,
  setWithChildren,
  childrenCount,
  setChildrenCount,
  infants,
  setInfants,
  text,
}: {
  withChildren: boolean;
  setWithChildren: (value: boolean) => void;
  childrenCount: number;
  setChildrenCount: (value: number) => void;
  infants: number;
  setInfants: (value: number) => void;
  text: PlannerFormText;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-3">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-emerald-950">
        <input
          type="checkbox"
          checked={withChildren}
          onChange={(event) => setWithChildren(event.target.checked)}
          className="h-4 w-4 accent-emerald-700"
        />
        {text.withChildren}
      </label>
      {withChildren ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={text.childrenCount}>
            <Input
              type="number"
              min={0}
              max={8}
              value={childrenCount}
              onChange={(event) => setChildrenCount(Math.max(0, Math.min(8, Number(event.target.value) || 0)))}
            />
          </Field>
          <Field label={text.infants}>
            <Input
              type="number"
              min={0}
              max={8}
              value={infants}
              onChange={(event) => setInfants(Math.max(0, Math.min(8, Number(event.target.value) || 0)))}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-32 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm leading-6 text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function DestinationAutocompleteField({
  label,
  value,
  onChange,
  onFocus,
  onSelect,
  suggestions,
  isLoading,
  isOpen,
  placeholder,
  loadingLabel,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onSelect: (suggestion: DestinationSuggestion) => void;
  suggestions: DestinationSuggestion[];
  isLoading: boolean;
  isOpen: boolean;
  placeholder?: string;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const inputId = useId();
  const listboxId = useId();
  const showDropdown = isOpen && (isLoading || suggestions.length > 0 || value.trim().length >= 2);

  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
      {label}
      <div className="relative mt-2">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          autoComplete="off"
        />
        {showDropdown ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 overflow-hidden rounded-[1.3rem] border border-emerald-900/10 bg-white shadow-[0_18px_40px_rgba(16,84,48,0.12)]"
          >
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-emerald-900/70">{loadingLabel}</div>
            ) : suggestions.length > 0 ? (
              <div className="max-h-64 overflow-y-auto py-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    id={`${listboxId}-option-${suggestion.id}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(suggestion);
                    }}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-emerald-50"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-emerald-950">{suggestion.city}</span>
                      <span className="mt-1 block text-xs text-emerald-900/68">
                        {[suggestion.country, suggestion.region].filter(Boolean).join(" / ")}
                      </span>
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      {suggestion.source}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-emerald-900/70">{emptyLabel}</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
