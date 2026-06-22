import { describe, expect, it } from 'vitest';
import { createAppCommands } from './appCommands';
import type { AppTheme } from './useThemePreference';

interface Recorder<Args extends unknown[]> {
  calls: Args[];
  fn: (...args: Args) => void;
}

function recorder<Args extends unknown[]>(): Recorder<Args> {
  const calls: Args[] = [];
  return {
    calls,
    fn: (...args: Args) => {
      calls.push(args);
    },
  };
}

// The injected dependencies ARE the effects each command performs. Driving the
// factory with independently-observable recorders and then invoking a command's
// action exercises the real wiring boundary: the call (and its argument) is the
// user-facing behavior, not a proxy for it.
function buildHarness() {
  const reloadFromDb = recorder<[]>();
  const setTheme = recorder<[AppTheme]>();
  const exportDatabaseJson = recorder<[]>();
  const copyCitationFormatted = recorder<[]>();
  const showAllColumns = recorder<[]>();
  const resetColumns = recorder<[]>();

  const deps = {
    reloadFromDb: reloadFromDb.fn,
    setTheme: setTheme.fn,
    exportDatabaseJson: exportDatabaseJson.fn,
    copyCitationFormatted: copyCitationFormatted.fn,
    showAllColumns: showAllColumns.fn,
    resetColumns: resetColumns.fn,
  };

  const commands = createAppCommands(deps);

  // Every non-theme effect is a distinct spy, so "this command fired the wrong
  // dependency" is observable as the wrong spy being called.
  const sideEffectDeps = [
    reloadFromDb,
    exportDatabaseJson,
    copyCitationFormatted,
    showAllColumns,
    resetColumns,
  ];

  function invoke(commandId: string): void {
    const command = commands.find(candidate => candidate.id === commandId);
    if (command === undefined) {
      throw new Error(`no command registered under id ${commandId}`);
    }
    command.action();
  }

  return { commands, deps, sideEffectDeps, setTheme, invoke };
}

describe('app command wiring', () => {
  // Each row pairs a command with the exact theme its action must apply. A
  // swapped argument (e.g. the dark command wired to 'monokai') fails here.
  const themeWiring: Array<{ id: string; theme: AppTheme }> = [
    { id: 'theme-dark', theme: 'code-dark' },
    { id: 'theme-light', theme: 'code-light' },
    { id: 'theme-monokai', theme: 'monokai' },
  ];

  it.each(themeWiring)(
    'command $id applies its own theme via the theme setter',
    ({ id, theme }) => {
      const harness = buildHarness();

      harness.invoke(id);

      // Correct effect: the theme setter ran with this command's theme...
      expect(harness.setTheme.calls).toEqual([[theme]]);
      // ...and no unrelated app effect was triggered.
      for (const sideEffect of harness.sideEffectDeps) {
        expect(sideEffect.calls).toEqual([]);
      }
    },
  );

  it('routes the three theme commands to three distinct themes', () => {
    const harness = buildHarness();

    for (const { id } of themeWiring) {
      harness.invoke(id);
    }

    const appliedThemes = harness.setTheme.calls.map(([theme]) => theme);
    // Proves no two theme commands collapse onto the same theme (a duplicate
    // would mean one command was cross-wired to another's argument).
    expect(new Set(appliedThemes)).toEqual(
      new Set<AppTheme>(['code-dark', 'code-light', 'monokai']),
    );
  });

  // Each row pairs a command with the single injected dependency its action
  // must invoke. The harness asserts every OTHER dependency stayed silent, so a
  // cross-wired action (one command firing another's dependency) fails.
  const sideEffectWiring: Array<{ id: string; dep: keyof ReturnType<typeof buildHarness>['deps'] }> = [
    { id: 'reload-db', dep: 'reloadFromDb' },
    { id: 'export-json', dep: 'exportDatabaseJson' },
    { id: 'citation-apa', dep: 'copyCitationFormatted' },
    { id: 'cols-show-all', dep: 'showAllColumns' },
    { id: 'cols-reset', dep: 'resetColumns' },
  ];

  it.each(sideEffectWiring)(
    'command $id routes to its own dependency and no other',
    ({ id, dep }) => {
      const harness = buildHarness();

      harness.invoke(id);

      // The command's own dependency ran exactly once...
      const firedDependency = harness.sideEffectDeps.find(
        sideEffect => sideEffect.fn === harness.deps[dep],
      );
      if (firedDependency === undefined) {
        throw new Error(`No side-effect recorder found for dependency ${dep}`);
      }
      expect(firedDependency.calls).toEqual([[]]);
      // ...the theme setter (a different effect channel) stayed silent...
      expect(harness.setTheme.calls).toEqual([]);
      // ...and every other side-effect dependency stayed silent, ruling out
      // cross-wiring and proving the action is not a dead no-op.
      const firedSideEffects = harness.sideEffectDeps.filter(
        sideEffect => sideEffect.calls.length > 0,
      );
      expect(firedSideEffects).toEqual([firedDependency]);
    },
  );

  it('exposes the read-only command set in a stable order', () => {
    const harness = buildHarness();

    // The id/order contract is a smaller, separate fact; it is not the proof of
    // behavior (the wiring tests above own that).
    expect(harness.commands.map(command => command.id)).toEqual([
      'reload-db',
      'theme-dark',
      'theme-light',
      'theme-monokai',
      'export-json',
      'citation-apa',
      'cols-show-all',
      'cols-reset',
    ]);
  });
});
