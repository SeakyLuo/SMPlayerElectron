import type { DatabaseSync } from 'node:sqlite'

const BUILTIN_PREFERENCE_ITEMS = [
  { type: 5, itemId: '5', itemName: 'Recent Added' },
  { type: 6, itemId: '6', itemName: 'My Favorites' },
  { type: 7, itemId: '7', itemName: 'Most Played' },
  { type: 8, itemId: '8', itemName: 'Least Played' },
]

export function ensurePreferenceCompatibility(db: DatabaseSync, settingId: number, activeState: number) {
  ensureBuiltinPreferenceItems(db, activeState)
  ensureBuiltinPreferenceSettingIds(db, settingId, activeState)
}

function ensureBuiltinPreferenceItems(db: DatabaseSync, activeState: number) {
  const builtinRows = BUILTIN_PREFERENCE_ITEMS.map(() => 'SELECT ? AS Type, ? AS ItemId, ? AS ItemName').join(' UNION ALL ')
  const builtinValues = BUILTIN_PREFERENCE_ITEMS.flatMap((item) => [item.type, item.itemId, item.itemName])

  db.prepare(`
    INSERT INTO PreferenceItem (Type, ItemId, ItemName, IsEnabled, Level, State)
    SELECT Builtins.Type, Builtins.ItemId, Builtins.ItemName, 0, 1, ?
    FROM (${builtinRows}) AS Builtins
    WHERE NOT EXISTS (
      SELECT 1
      FROM PreferenceItem
      WHERE PreferenceItem.Type = Builtins.Type
        AND PreferenceItem.State = ?
    )
  `).run(activeState, ...builtinValues, activeState)
}

function ensureBuiltinPreferenceSettingIds(db: DatabaseSync, settingId: number, activeState: number) {
  db.prepare(`
    UPDATE PreferenceSetting
    SET
      RecentAddedId = (SELECT Id FROM PreferenceItem WHERE Type = 5 AND State = ? ORDER BY Id LIMIT 1),
      MyFavoritesId = (SELECT Id FROM PreferenceItem WHERE Type = 6 AND State = ? ORDER BY Id LIMIT 1),
      MostPlayedId = (SELECT Id FROM PreferenceItem WHERE Type = 7 AND State = ? ORDER BY Id LIMIT 1),
      LeastPlayedId = (SELECT Id FROM PreferenceItem WHERE Type = 8 AND State = ? ORDER BY Id LIMIT 1)
    WHERE Id = ?
  `).run(
    activeState,
    activeState,
    activeState,
    activeState,
    settingId,
  )
}
