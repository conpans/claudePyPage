# Oracles

An oracle is a second, independent solution to a coding item. It exists so that an expected
value in the content is never backed only by the reference solution that sits next to it.

`npm run verify:native` runs every oracle on this computer's own Python and checks that:

- every expected value in the item's tests and examples equals what the oracle computes;
- the reference solution and the oracle agree on 300 random inputs from the item's stated
  domain (boundaries included).

## Writing one

1. Run `node scripts/export-statements.mjs`. It writes the task as a learner sees it to
   `.local/statements/<item-id>.md`, without tests, expected values or the solution.
2. Work from that file only. Do not open the item's YAML file: the point is to arrive at the
   behavior from the task statement, not from the reference solution.
3. Create `verify/oracles/<item_id_with_underscores>.py` with one function:

   ```python
   def oracle(numbers):
       return {"running_totals": [sum(numbers[: end + 1]) for end in range(len(numbers))]}
   ```

   - The parameters are the item's given variables, by name.
   - Return a dictionary with one entry per result variable. If the task prints, add an
     `"output"` entry holding the printed text, lines joined with `\n`.
   - Write it in a different style from a beginner's loop: built-ins, slicing, comprehensions.
     A different route to the same answer is what makes the comparison meaningful.
   - Do not change the arguments. If the task changes a given list in place, work on a copy
     and return the new value under the variable's name.
4. If the statement is unclear or an example contradicts a rule, that is a finding. Fix the
   item's wording rather than guessing.
