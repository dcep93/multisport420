# MLB Default Category Design

## Goal

Make MLB the default Multisport stream category when MLB is available.

## Design

Change `PREFERRED_DEFAULT_CATEGORY` in
`app/src/app_x/components/optionsShared.ts` from `NBA` to `MLB`. Keep
`getDefaultCategory`'s existing fallback behavior unchanged: when MLB is not
available, use the first available category, or `ALL` when there are no
categories.

This focused constant change is preferred over reordering host category lists
because it expresses the default directly without changing display order. A
seasonal or date-dependent default is outside the requested scope.

## Verification

Run the app's lint and build commands. Inspect the final diff to confirm that
the runtime change is limited to the preferred category constant.
