import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../api/client';
import {
  isMissing,
  KIND_LABEL,
  miles,
  provenance,
  STAGE_LABEL,
  stateGrade,
  text,
  tuition,
  zonedLevel,
} from '../../api/fields';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import { useSetState } from '../../hooks/useSetState';
import { useProfile } from '../../profile/ProfileProvider';
import { VALUE_LABEL_KEYS, VALUE_OPTIONS } from '../../data/family';
import { chip, toggleInList } from '../../utils/chip';
import { ZONE_LEVELS, ZONE_STYLE } from '../../utils/mapStyle';
import { childName, stageForAge } from '../../utils/stages';
import { onMapUpdate, onShowSchools, setMapContext, takePendingMap, takePendingShow } from '../../hooks/chatStore';
import { cellNote, cellText, comparableRows, joinNames, levelText, shortDate, specLabel } from './exploreText';

const KINDS = ['public', 'charter', 'private', 'early_learning'];
const DEFAULT_KINDS = KINDS.filter((k) => k !== 'early_learning'); // early learning is opt-in from the Filters tab
const SPECIALTIES = ['STEM', 'Arts', 'Bilingual', 'IB'];

// The filter fields a chat answer may change, remembered so a change that empties the map can be undone (see the guard in useExplore).
const FILTER_KEYS = ['view', 'kid', 'radius', 'freeOnly', 'kinds', 'spec', 'onlySpec', 'priorities', 'values', 'ese', 'gradeB'];
const pickFilters = (st) => Object.fromEntries(FILTER_KEYS.map((k) => [k, st[k]]));
/** "Public + Early learning": one card for a campus that has more than one kind of program. */
const kindLabel = (sc) => [...new Set([sc.kind, ...(sc.also_serves ?? []).map((a) => a.kind)])].map((k) => KIND_LABEL[k]).join(' + ');
const pickLocation = (p) => ({ lat: p.lat, lon: p.lon, address: p.address, matchedAddress: p.matchedAddress, precision: p.precision });

const initialFilters = (profile) => ({
  view: 'top', // top = best matches (5), all = everything nearby sorted by distance
  kid: (profile.children ?? []).length > 1 ? 'all' : (profile.children ?? []).length === 1 ? 0 : 'any', // 'all' | child index | 'any'
  radius: profile.radius ?? 3,
  freeOnly: !!profile.freeOnly,
  kinds: [...DEFAULT_KINDS],
  spec: [], // specialty chips: boost the ranking (or, with onlySpec, restrict the list)
  onlySpec: false,
  priorities: [...(profile.priorities ?? [])], // from the family profile; removable here without changing the profile
  values: [...(profile.values ?? [])], // what matters most (academics, programs, popularity, proximity); changeable in the Filters tab
  ese: false,
  gradeB: false,
});


const VERIFICATION_LEVELS = ['confirmed_district_source', 'other_district_policies', 'single_secondary_source', 'unconfirmed_project_spec'];
const verificationLevel = (method = '') => VERIFICATION_LEVELS.find((k) => method.includes(k));

/** State, live data and derived view values for the Explore screen. Search, compare and dates come from the backend. */
export function useExplore() {
  const { profile, setLocation, updateProfile } = useProfile();
  const { t, tp, nf, date, days, lang } = useI18n();
  const names = (list) => joinNames(list, t);
  const [s, setState] = useSetState(() => ({
    ...initialFilters(profile),
    selected: null,
    found: null, // a school jumped to by name: kept on the map even if it is outside the radius or the filters
    searchNotice: null,
    pinned: null,
    guard: null, // {prev}: filters a chat answer just changed; undone if they leave no schools
    chatNote: null,
    compare: [],
    cmpFull: false,
    chatOpen: false,
    zoneLevels: ['elementary'],
    locationError: null,
  }));
  const home = profile.hasLocation ? { lat: profile.lat, lon: profile.lon } : null; // null until the family enters an address
  const children = profile.children ?? [];

  // ---- which life stages to search for ----
  const kidStages = useMemo(() => {
    if (s.kid === 'any') return [];
    const pick = s.kid === 'all' ? children : [children[s.kid]].filter(Boolean);
    return [...new Set(pick.map((c) => stageForAge(c.age)).filter(Boolean))];
  }, [s.kid, children]);

  const params = {
    lat: home?.lat,
    lon: home?.lon,
    radius_mi: s.radius,
    kinds: s.kinds.length === KINDS.length ? undefined : s.kinds,
    stage: kidStages,
    free_only: s.freeOnly,
    specialties: s.onlySpec ? s.spec : undefined,
    ese: s.ese,
    grade_min: s.gradeB ? 'B' : undefined,
    priorities: [...new Set([...s.priorities, ...s.spec])],
    values: s.values,
    sort: s.view === 'top' ? 'match' : 'distance',
    limit: s.view === 'top' ? 5 : 30,
  };
  const mapSearchKey = JSON.stringify(params);
  // Jarvis starts its school searches from exactly what the map is showing, so both lists are the same schools.
  useEffect(() => {
    const { lat, lon, stage, ...rest } = JSON.parse(mapSearchKey);
    setMapContext({ ...rest, stage });
    return () => setMapContext(null);
  }, [mapSearchKey]);
  const search = useApi((signal) => api.schools(params, { signal }), [JSON.stringify(params)], {
    enabled: s.kinds.length > 0 && !!home,
    delay: 250,
  });
  // Schools picked from a chat answer replace the filtered list until a filter changes or the family goes back to their filters.
  const pinned = s.pinned && s.pinned.key === mapSearchKey ? s.pinned : null;
  const visible = pinned ? pinned.schools : s.kinds.length > 0 ? (search.data?.results ?? []) : [];
  const meta = search.data?.meta;

  // ---- compare (server-side, aligned rows) ----
  const cmpIds = s.compare;
  const cmpKey = cmpIds.join(',');
  const cmpApi = useApi(
    (signal) =>
      api.compare(
        { ids: cmpIds, lat: home?.lat, lon: home?.lon, radius_mi: s.radius, priorities: params.priorities, values: params.values },
        { signal },
      ),
    [cmpKey, home?.lat, home?.lon, s.radius, JSON.stringify(params.priorities), JSON.stringify(params.values)],
    {
      enabled: cmpIds.length > 0,
    },
  );
  const dates = useApi((signal) => api.dates({ signal }), []);

  const toggleCmp = (id) =>
    setState((st) => {
      if (st.compare.includes(id)) return { compare: st.compare.filter((x) => x !== id), cmpFull: false };
      if (st.compare.length >= 3) return { cmpFull: true, cmpFullAt: Date.now() };
      return { compare: [...st.compare, id], cmpFull: false };
    });
  // Put one school on the map and open its card. With no address yet, the school's own address becomes the starting point.
  const goToSchool = async (hit, others, total) => {
    if (!home && hit.address) await setLocation([hit.address, hit.city].filter(Boolean).join(', '));
    const d = await api.school(hit.id, home?.lat ?? hit.lat, home?.lon ?? hit.lon);
    setState({ found: d.school, selected: hit.id, searchNotice: { name: hit.name, others, total, atSchool: !home } });
  };
  const toggleIn = (key, v) => setState((st) => ({ [key]: toggleInList(st[key], v) }));

  const pinColors = (id) => {
    const inCmp = s.compare.includes(id);
    const active = s.selected === id;
    return {
      inCmp,
      active,
      bg: active ? 'var(--ink)' : inCmp ? '#F6C343' : 'var(--accent-grad)',
      fg: active ? 'var(--ink-inv)' : inCmp ? 'var(--ink)' : 'var(--on-accent)',
    };
  };
  const cmpStyle = (inCmp) => ({
    inCmp,
    cmpLabel: inCmp ? t('explore.cmp.in') : t('explore.cmp.add'),
    cmpBg: inCmp ? '#F6C343' : 'var(--glass2)',
    cmpFg: inCmp ? '#1B1830' : 'var(--ink)',
    cmpBorder: inCmp ? '#F6C343' : 'var(--line2)',
  });

  // A chat answer's schools go onto the map (and one card opens if a single pin was chosen). Answers picked on another page wait here.
  useEffect(() => {
    const show = ({ schools, selectedId, filters: f, origin, compare }) => {
      // The family asked about another place ("1 mile from Wynwood"): the map is centred there, so its matches are Jarvis's schools.
      if (origin) {
        updateProfile({ lat: origin.lat, lon: origin.lon, address: origin.label ?? profile.address, matchedAddress: origin.label ?? profile.matchedAddress, precision: origin.precision ?? profile.precision });
      }
      if (!f) {
        // no filters to copy (a name lookup, a school's details, a comparison): show exactly those schools until a filter changes
        setState({
          pinned: { schools, key: mapSearchKey },
          selected: selectedId ?? null,
          found: null,
          searchNotice: null,
          ...(compare ? { compare: schools.slice(0, 3).map((x) => x.id), cmpFull: false } : {}),
        });
        return;
      }
      // The map takes the filters Jarvis searched with, so the Filters tab and the Matches list say the same thing as the chat.
      setState((st) => {
        const kids = children.map((c) => stageForAge(c.age));
        const want = f.stages ?? [];
        const kid = !want.length
          ? 'any'
          : kids.length > 1 && kids.every((k) => want.includes(k))
            ? 'all'
            : kids.findIndex((k) => want.includes(k)) >= 0 && new Set(kids.filter((k) => want.includes(k))).size === want.length
              ? kids.findIndex((k) => want.includes(k))
              : 'any';
        const rank = (f.priorities ?? []).filter((p) => SPECIALTIES.includes(p));
        const spec = SPECIALTIES.filter((p) => [...(f.specialties ?? []), ...rank].includes(p));
        return {
          view: 'top',
          kid,
          radius: Math.min(25, Math.max(1, Math.round(f.radius_mi ?? st.radius))),
          kinds: f.kinds?.length ? KINDS.filter((k) => f.kinds.includes(k)) : [...KINDS],
          freeOnly: !!f.free_only,
          gradeB: ['A', 'B'].includes(f.grade_min),
          ese: !!f.ese,
          values: VALUE_OPTIONS.filter((v) => (f.values ?? []).includes(v)),
          spec,
          onlySpec: (f.specialties ?? []).length > 0,
          priorities: (f.priorities ?? []).filter((p) => !SPECIALTIES.includes(p)),
          pinned: null,
          selected: selectedId ?? null,
          found: null,
          searchNotice: null,
          chatNote: null,
          guard: st.guard ?? { prev: pickFilters(st), loc: origin ? pickLocation(profile) : null },
        };
      });
    };
    const waiting = takePendingShow();
    if (waiting) show(waiting);
    return onShowSchools(show);
  }, [mapSearchKey, setState, children, profile, updateProfile]);

  // Children added or removed (for example told to Jarvis) change who the map is for: all of them, or the only one.
  const kidCount = children.length;
  const firstKidRun = useRef(true);
  useEffect(() => {
    if (firstKidRun.current) {
      firstKidRun.current = false;
      return;
    }
    setState((st) => ({ ...st, kid: kidCount > 1 ? 'all' : kidCount === 1 ? 0 : 'any', selected: null }));
  }, [kidCount, setState]);

  // Filters Jarvis was asked to apply (only a direct request reaches here; a question just gets an offer) go straight onto the map.
  useEffect(() => {
    const apply = (u) =>
        setState((st) => {
          const patch = u.reset ? initialFilters(profile) : {};
          if (u.radius_mi != null) patch.radius = Math.min(25, Math.max(1, Math.round(u.radius_mi)));
          if (u.kinds?.length) patch.kinds = KINDS.filter((k) => u.kinds.includes(k));
          if (u.free_only != null) patch.freeOnly = u.free_only;
          if (u.grade_min) patch.gradeB = ['A', 'B'].includes(u.grade_min);
          if (u.ese != null) patch.ese = u.ese;
          if (u.values) patch.values = VALUE_OPTIONS.filter((v) => u.values.includes(v));
          if (u.view) patch.view = u.view;
          if (u.kid != null) patch.kid = u.kid;
          if (u.programs) {
            patch.spec = SPECIALTIES.filter((p) => u.programs.includes(p));
            if (u.programs.includes('Montessori')) patch.priorities = [...new Set([...(u.reset ? [] : st.priorities), 'Montessori'])];
          }
          if (u.only_programs != null) patch.onlySpec = u.only_programs && (patch.spec ?? st.spec).length > 0;
          return { ...patch, selected: null, chatNote: null, guard: st.guard ?? { prev: pickFilters(st) } };
        });
    const waiting = takePendingMap(); // filters asked for in the onboarding chat, which sent the family here
    if (waiting) apply(waiting);
    return onMapUpdate(apply);
  }, [profile, setState]);

  // The guard: filters a chat answer applied are kept only if they leave schools to show. Once the search for them has answered with
  // nothing, the earlier filters come back and a note says so, so a question to Jarvis can never leave the map empty.
  useEffect(() => {
    if (!s.guard || pinned || search.loading || !search.data) return;
    const fa = search.data.meta?.filters_applied ?? {};
    const o = search.data.meta?.origin;
    if (home && o && (Math.abs(o.lat - home.lat) > 1e-6 || Math.abs(o.lon - home.lon) > 1e-6)) return; // still the old location
    if (fa.ese !== s.ese || fa.radius_mi !== s.radius || fa.free_only !== s.freeOnly || (fa.grade_min ?? null) !== (s.gradeB ? 'B' : null)) return; // not the answer to these filters yet
    if (visible.length === 0 && s.kinds.length > 0) {
      if (s.guard.loc) updateProfile(s.guard.loc);
      setState({ ...s.guard.prev, guard: null, selected: null, chatNote: t('explore.chat.nothing') });
    } else setState({ guard: null });
  }, [s.guard, s.ese, s.radius, s.freeOnly, s.gradeB, s.kinds.length, pinned, search.loading, search.data, visible.length, setState, t, updateProfile, home?.lat, home?.lon]);

  // Which of the family's children a school could serve (from its parsed grade range).
  const fitsFor = (sc) => {
    if (!children.length) return '';
    const stages = sc.stages?.value ?? [];
    const fitNames = children
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => stages.includes(stageForAge(c.age)))
      .map(({ c, i }) => childName(c, i));
    if (!fitNames.length) return t('explore.fit.none');
    return fitNames.length === children.length && children.length > 1
      ? t('explore.fit.all')
      : t('explore.fit.some', { names: names(fitNames) });
  };

  // ---- map (real map: Leaflet + OpenStreetMap; zone polygons from /api/zones/geojson) ----
  const zonesApi = useApi((signal) => api.zoneShapes(home.lat, home.lon, { signal }), [home?.lat, home?.lon], { enabled: !!home });
  const shown = s.found && !visible.some((x) => x.id === s.found.id) ? [...visible, s.found] : visible;
  const pins = shown.map((sc, i) => {
    const c = pinColors(sc.id);
    return {
      id: sc.id,
      rank: sc.id === s.found?.id ? '★' : i + 1,
      lat: sc.lat,
      lon: sc.lon,
      bg: c.bg,
      fg: c.fg,
      shadow: c.active
        ? '0 0 0 4px rgba(201,187,255,0.35), 0 0 24px rgba(201,187,255,0.85)'
        : 'var(--pin-glow)',
      aria: t(c.inCmp ? 'explore.pin.ariaCmp' : 'explore.pin.aria', { rank: i + 1, name: sc.name }),
      active: c.active,
      inCmp: c.inCmp,
    };
  });
  // `lang` is part of the key so the pins' accessible labels are rebuilt when the language changes
  const pinsKey = JSON.stringify([lang, ...pins.map((p) => [p.id, p.rank, p.active, p.inCmp])]);

  const sel = shown.find((x) => x.id === s.selected) ?? null;
  let pop = {};
  if (sel) {
    pop = {
      id: sel.id,
      name: sel.name,
      type: kindLabel(sel),
      grades: text(sel.grades, t('explore.gradesNotListed')),
      distLabel: sel.flags?.includes('online_school') ? t('explore.online') : miles(sel.distance_mi),
      money: tuition(sel.tuition),
      gradeLabel: isMissing(sel.state_grade) ? t('shared.notAvailable') : sel.state_grade.value,
      enrollment: isMissing(sel.enrollment) ? t('shared.notAvailable') : nf(sel.enrollment.value),
      fits: fitsFor(sel),
      website: isMissing(sel.website) ? null : sel.website.value,
      ...cmpStyle(s.compare.includes(sel.id)),
      toggle: () => toggleCmp(sel.id),
    };
  }

  const zoneFeatures = zonesApi.data?.features ?? [];
  const zoneToggles = ZONE_LEVELS.map((level) => {
    const f = zoneFeatures.find((x) => x.properties.level === level);
    if (!f) return null;
    const on = s.zoneLevels.includes(level);
    return {
      level,
      color: ZONE_STYLE[level].color,
      on,
      label: t('explore.zone.label', {
        level: t(ZONE_STYLE[level].labelKey),
        school: f.properties.school_name ?? t('explore.zone.school'),
      }),
      toggle: () => setState((st) => ({ zoneLevels: toggleInList(st.zoneLevels, level) })),
    };
  }).filter(Boolean);

  const wanted = [...s.priorities, ...s.spec].map((x) => x.toLowerCase());
  const matchedTags = (sc) =>
    isMissing(sc.specialties)
      ? []
      : sc.specialties.value.filter((tag) => wanted.includes(String(tag).toLowerCase()));

  // ---- result cards ----
  const results = visible.map((sc, i) => {
    const c = pinColors(sc.id);
    const lvl = zonedLevel(sc.zoned);
    const chips = [
      { label: tuition(sc.tuition), title: provenance(sc.tuition) },
      { label: stateGrade(sc.state_grade), title: provenance(sc.state_grade) },
    ];
    if (lvl) chips.push({ label: levelText('explore.chip.zoned', lvl, t), title: provenance(sc.zoned) });
    const tags = matchedTags(sc);
    if (tags.length)
      chips.push({
        label: t('explore.chip.matches', { tags: tags.map((x) => specLabel(x, t)).join(', ') }),
        title: provenance(sc.specialties),
      });
    if (sc.flags?.includes('online_school'))
      chips.push({
        label: t('explore.online'),
        title: t('explore.chip.onlineTitle'),
      });
    if (sc.flags?.includes('grade_match_unverified'))
      chips.push({
        label: t('explore.chip.verifyGrade'),
        title: t('explore.chip.verifyGradeTitle'),
      });
    return {
      id: sc.id,
      rank: i + 1,
      name: sc.name,
      type: kindLabel(sc),
      grades: text(sc.grades, t('explore.gradesNotListed')),
      dist: sc.flags?.includes('online_school') ? t('explore.dist.online') : miles(sc.distance_mi),
      chips,
      whyBody: { lat: home?.lat, lon: home?.lon, radius_mi: s.radius, priorities: params.priorities, values: params.values },
      fits: fitsFor(sc),
      match: sc.match_score,
      reasons: (sc.reasons ?? [])
        .filter((x) => !/not scored/i.test(x))
        .slice(0, 3)
        .join(' · '),
      bg: c.bg,
      fg: c.fg,
      cardBorder: c.active ? 'var(--ink)' : c.inCmp ? '#F6C343' : 'var(--line)',
      ...cmpStyle(c.inCmp),
      show: () => setState({ selected: sc.id }),
      toggle: () => toggleCmp(sc.id),
    };
  });

  // ---- compare table ----
  const cmpData =
    cmpApi.data && cmpApi.data.schools.map((x) => x.id).join(',') === cmpKey ? cmpApi.data : null;
  const cmpRows = comparableRows(cmpData?.rows ?? []).map((row) => ({
    label: row.label,
    cells: row.cells.map((f, i) => ({
      text: cellText(row.key, f, { t, nf }),
      note: cellNote(f),
      best: row.best_index === i,
      missing: isMissing(f),
      title: provenance(f),
      bg: row.best_index === i ? 'var(--accent-tint)' : 'transparent', // plain cells sit on the table's solid surface
    })),
  }));
  const cmpMessage = cmpApi.error
    ? `${cmpApi.error.message} ${cmpApi.error.suggestedAction ?? ''}`
    : cmpIds.length && !cmpData
      ? t('explore.cmp.loading')
      : '';

  const switchDefs = [
    { key: 'freeOnly', label: t('explore.switch.free.label'), hint: t('explore.switch.free.hint') },
    {
      key: 'ese',
      needs: 'ese_signals',
      label: t('explore.switch.ese.label'),
      hint: t('explore.switch.ese.hint'),
    },
    {
      key: 'gradeB',
      needs: 'state_grades',
      label: t('explore.switch.grade.label'),
      hint: t('explore.switch.grade.hint'),
    },
  ];
  const plural = (n) => tp('explore.schools', n);
  const hidden = Object.values(meta?.excluded ?? {}).reduce((a, b) => a + b, 0);
  const kidLabel =
    s.kid === 'any'
      ? t('explore.kid.heading.any')
      : s.kid === 'all'
        ? children.length
          ? t('explore.kid.heading.for', { names: names(children.map((c, i) => childName(c, i))) })
          : t('explore.kid.heading.all')
        : t('explore.kid.heading.for', { names: childName(children[s.kid], s.kid) });

  // ---- active filters: everything that is narrowing or re-ranking the list, with how many schools each one hides ----
  const exc = meta?.excluded ?? {};
  const activeFilters = [];
  const addFilter = (id, label, count, remove, note) =>
    activeFilters.push({ id, label, count, remove, note });
  if (kidStages.length) {
    const who = (s.kid === 'all' ? children : [children[s.kid]])
      .filter(Boolean)
      .map((c) => childName(c, children.indexOf(c)));
    addFilter(
      'kid',
      t('explore.active.kid', {
        who: names(who),
        stages: kidStages.map((st) => STAGE_LABEL[st]).join(' + '),
      }),
      exc.stage,
      () => setState({ kid: 'any' }),
    );
  }
  if (s.freeOnly)
    addFilter('free', t('explore.switch.free.label'), exc.free_only, () => setState({ freeOnly: false }));
  if (s.kinds.length !== DEFAULT_KINDS.length || !DEFAULT_KINDS.every((k) => s.kinds.includes(k)))
    addFilter(
      'kinds',
      t('explore.active.types', {
        types: s.kinds.map((k) => KIND_LABEL[k]).join(', ') || t('explore.active.typesNone'),
      }),
      undefined,
      () => setState({ kinds: [...DEFAULT_KINDS] }),
    );
  s.priorities.forEach((p) =>
    addFilter(
      `prio-${p}`,
      t('explore.active.priority', { name: specLabel(p, t) }),
      undefined,
      () => setState((st) => ({ priorities: st.priorities.filter((x) => x !== p) })),
      t('explore.active.boostsNote'),
    ),
  );
  s.values.forEach((v) =>
    addFilter(`value-${v}`, t(VALUE_LABEL_KEYS[v]), undefined, () => setState((st) => ({ values: st.values.filter((x) => x !== v) })), t('explore.active.boostsNote')),
  );
  s.spec
    .filter((sp) => !s.priorities.includes(sp))
    .forEach((sp, i) =>
      s.onlySpec
        ? addFilter(
            `spec-${sp}`,
            t('explore.active.only', { name: specLabel(sp, t) }),
            i === 0 ? exc.specialties : undefined,
            () => setState((st) => ({ spec: st.spec.filter((x) => x !== sp) })),
          )
        : addFilter(
            `spec-${sp}`,
            t('explore.active.boost', { name: specLabel(sp, t) }),
            undefined,
            () => setState((st) => ({ spec: st.spec.filter((x) => x !== sp) })),
            t('explore.active.boostsNote'),
          ),
    );
  if (s.ese) addFilter('ese', t('explore.active.ese'), exc.ese, () => setState({ ese: false }));
  if (s.gradeB)
    addFilter('grade', t('explore.switch.grade.label'), exc.grade_min, () => setState({ gradeB: false }));

  return {
    loading: search.loading,
    error: search.error,
    notes: [...(meta?.notes ?? []), ...(children.some((c) => c.support) ? [t('explore.notes.support')] : [])],

    // map
    home,
    radiusMi: s.radius,
    pinsKey,
    fitKey: JSON.stringify([home?.lat, home?.lon, s.radius, pins.map((p) => p.id), s.found?.id]),
    onPick: (id) => setState({ selected: id }),
    caption: t('explore.caption'),
    zones: zonesApi.data,
    zoneLevels: s.zoneLevels,
    zoneToggles,
    zoneNote: zonesApi.data
      ? t('explore.zone.note', {
          note: zonesApi.data.note,
          source: zoneFeatures[0]?.properties.source ?? t('explore.zone.gis'),
          date: zoneFeatures[0]?.properties.as_of ?? t('shared.na'),
        })
      : '',

    // heading
    title: s.view === 'top' ? t('explore.title.top') : t('explore.title.all'),
    subtitle: t(s.view === 'top' ? 'explore.subtitle.top' : 'explore.subtitle.all', {
      address: profile.matchedAddress,
      kids: kidLabel,
    }),
    badge: profile.precision === 'zip' ? t('explore.badge.zip') : null,
    views: [
      { id: 'top', label: t('explore.view.top') },
      { id: 'all', label: t('explore.view.all') },
    ].map((v) => ({
      label: v.label,
      on: s.view === v.id,
      bg: s.view === v.id ? 'var(--seg-on)' : 'transparent',
      weight: s.view === v.id ? '700' : '600',
      shadow: s.view === v.id ? '0 1px 3px rgba(16,35,46,0.2)' : 'none',
      pick: () => setState({ view: v.id }),
    })),
    kids: [
      ...(children.length > 1 ? [{ id: 'all', label: t('explore.kid.all') }] : []),
      ...children.map((c, i) => ({ id: i, label: `${childName(c, i)} · ${c.age}` })),
      { id: 'any', label: t('explore.kid.any') },
    ].map((k) => ({
      label: k.label,
      on: s.kid === k.id,
      pick: () => setState({ kid: k.id }),
      ...chip(s.kid === k.id),
    })),

    // location search (header)
    locationError: s.locationError,
    searchNotice: s.searchNotice,
    dismissNotice: () => setState({ searchNotice: null }),
    // Words that are not an address are tried as a school name first; "Coral Reef" jumps to the school, "1234 SW 8 St" is geocoded.
    searchLocation: async (q) => {
      setState({ locationError: null, searchNotice: null });
      try {
        if (!/^\s*\d/.test(q)) {
          const r = await api.lookup(q, home?.lat, home?.lon);
          if (r.total > 0) {
            await goToSchool(r.results[0], r.results.slice(1, 5), r.total);
            return;
          }
        }
        await setLocation(q);
        setState({ selected: null, found: null });
      } catch (e) {
        setState({ locationError: `${e.message} ${e.suggestedAction ?? ''}`.trim() });
      }
    },
    pickFound: async (hit) => {
      try {
        await goToSchool(hit, [], 1);
      } catch (e) {
        setState({ locationError: `${e.message} ${e.suggestedAction ?? ''}`.trim() });
      }
    },

    // overlay
    pins,
    hasPop: !!sel,
    pop,
    closePop: () => setState({ selected: null }),
    chatNote: s.chatNote,
    dismissChatNote: () => setState({ chatNote: null }),
    pinnedNotice: pinned ? { text: t('explore.pinned.title', { n: pinned.schools.length }), back: t('explore.pinned.back') } : null,
    clearPinned: () => setState({ pinned: null, selected: null }),
    countLabel: pinned
      ? t('explore.pinned.count', { n: pinned.schools.length })
      : !home
      ? t('explore.count.noAddress')
      : s.kinds.length === 0
        ? plural(0)
        : search.loading && !search.data
          ? t('explore.searching')
          : meta && meta.total_matching > visible.length
            ? t('explore.count.of', {
                schools: plural(visible.length),
                total: meta.total_matching,
                radius: s.radius,
              })
            : t('explore.count.all', { schools: plural(visible.length), radius: s.radius }),
    hiddenLabel: !home
      ? ''
      : s.kinds.length === 0
        ? t('explore.hidden.pick')
        : hidden > 0
          ? t('explore.hidden.n', { n: nf(hidden) })
          : t('explore.hidden.none'),
    noResults: !pinned && !!home && !search.loading && !search.error && visible.length === 0,

    // filters
    radius: s.radius,
    radiusLabel: t('explore.radius', { n: s.radius }),
    onRadius: (e) => setState({ radius: Number(e.target.value) }),
    types: KINDS.map((k) => ({
      label: KIND_LABEL[k],
      on: s.kinds.includes(k),
      pick: () => toggleIn('kinds', k),
      ...chip(s.kinds.includes(k)),
    })),
    // A specialty is "on" if it came from the family's priorities or from this chip row; clicking an "on" chip turns off both.
    specs: SPECIALTIES.map((sp) => {
      const on = s.spec.includes(sp) || s.priorities.includes(sp);
      return {
        label: specLabel(sp, t),
        on,
        pick: () =>
          setState((st) =>
            on
              ? { spec: st.spec.filter((x) => x !== sp), priorities: st.priorities.filter((x) => x !== sp) }
              : { spec: [...st.spec, sp] },
          ),
        ...chip(on),
      };
    }),
    onlySpec: s.onlySpec,
    toggleOnlySpec: () => setState((st) => ({ onlySpec: !st.onlySpec })),
    specNote: t('explore.filters.specNote'),
    activeFilters,
    hiddenTotal: hidden,
    valueChips: VALUE_OPTIONS.map((v) => ({
      label: t(VALUE_LABEL_KEYS[v]),
      tip: t(`${VALUE_LABEL_KEYS[v]}.tip`),
      on: s.values.includes(v),
      pick: () => toggleIn('values', v),
      ...chip(s.values.includes(v)),
    })),
    hasLocation: !!home,
    switches: switchDefs.map((w) => ({
      label: w.label,
      hint: w.hint,
      disabled: !!w.needs && meta?.data_available?.[w.needs] === false,
      disabledReason: w.needs ? t('explore.switch.disabledReason') : '',
      on: s[w.key],
      track: s[w.key] ? 'var(--accent-grad)' : 'var(--line2)',
      knob: s[w.key] ? '21px' : '3px',
      toggle: () => setState((st) => ({ [w.key]: !st[w.key] })),
    })),
    reset: () => setState({ ...initialFilters(profile), selected: null, found: null, searchNotice: null }),

    // cards
    resultsTitle:
      search.loading && !search.data
        ? t('explore.results.finding')
        : t('explore.results.title', { schools: plural(visible.length) }),
    sortLabel: s.view === 'top' ? t('explore.sort.top') : t('explore.sort.all'),
    results,

    // compare
    hasCmp: !!cmpData && cmpRows.length > 0,
    noCmp: cmpIds.length === 0,
    cmpFull: s.cmpFull,
    cmpFullAt: s.cmpFullAt ?? 0,
    dismissCmpFull: () => setState({ cmpFull: false }),
    cmpMessage,
    cmpCountLabel: t('explore.cmp.count', { n: cmpIds.length }),
    clearCmp: () => setState({ compare: [], cmpFull: false }),
    cmpCols: `220px repeat(${Math.max(cmpIds.length, 1)}, minmax(210px, 1fr))`,
    cmpMinW: `${220 + 210 * Math.max(cmpIds.length, 1)}px`,
    cmpHead: (cmpData?.schools ?? []).map((x) => ({
      id: x.id,
      name: x.name,
      kind: x.kind,
      removeLabel: t('explore.cmp.remove', { name: x.name }),
      remove: () => toggleCmp(x.id),
    })),
    cmpRows,
    cmpChart: (cmpData?.scores ?? []).map((sc) => ({
      name: cmpData.schools.find((x) => x.id === sc.id)?.name ?? sc.id,
      match_score: sc.match_score,
      breakdown: sc.breakdown,
    })),

    // dates (from the curated rules file, each with its verification level)
    dates: (dates.data?.dates ?? []).map((d) => {
      const level = verificationLevel(d.field?.method);
      return {
        level,
        levelLabel: level ? t(`verify.${level}.label`) : '',
        note: level ? t(`dates.verify.${level}`) : '',
        source: d.field?.source ?? '',
        url: d.field?.url ?? '',
        asOf: d.field?.as_of ? date(d.field.as_of.slice(0, 10)) : '',
        when: shortDate(d.date, lang),
        what: d.label,
        who: `${date(d.date)}${d.approximate ? ` ${t('dates.approx')}` : ''} · ${
          d.days_until >= 0
            ? t('dates.in', { days: days(d.days_until) })
            : t('dates.ago', { days: days(-d.days_until) })
        }`,
        color: d.days_until < 0 ? 'var(--ink3)' : d.approximate ? '#B45309' : 'var(--accent)',
      };
    }),
    datesError: dates.error,

    // assistant
    chatOpen: s.chatOpen,
    chatButtonLabel: s.chatOpen ? t('explore.navi.close') : t('nav.ask'),
    toggleChat: () => setState((st) => ({ chatOpen: !st.chatOpen })),
  };
}
