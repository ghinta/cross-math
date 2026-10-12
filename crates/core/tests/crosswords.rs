use cross_math_core::crossword::{Puzzle, proof};
use cross_math_core::{Op, check, generate, hint, solve};

// Separate arithmetic and exhaustive tile permutation reference. This does
// not use the engine's domains, proof strategy, or arithmetic implementation.
fn relation(eq: &cross_math_core::crossword::Equation, board: &[Option<i32>]) -> Option<bool> {
    let [a, b, c] = eq.cells.map(|i| board[i].map(i64::from));
    let (a, b, c) = (a?, b?, c?);
    Some(match eq.operator {
        Op::Add => a + b == c,
        Op::Sub => a - b == c,
        Op::Mul => a * b == c,
        Op::Div => b != 0 && a % b == 0 && a / b == c,
    })
}
fn reference_count(p: &Puzzle, board: &mut Vec<Option<i32>>, bank: &mut Vec<i32>) -> usize {
    if p.equations
        .iter()
        .any(|e| relation(e, board) == Some(false))
    {
        return 0;
    }
    // Finish equations as early as possible; enumerate all distinct values.
    let next = (0..board.len())
        .filter(|&i| board[i].is_none())
        .max_by_key(|&i| {
            p.equations
                .iter()
                .filter(|e| {
                    e.cells.contains(&i)
                        && e.cells.iter().filter(|&&c| board[c].is_none()).count() == 1
                })
                .count()
        });
    let Some(cell) = next else {
        return 1;
    };
    let mut count = 0;
    let mut seen = vec![];
    for i in 0..bank.len() {
        let n = bank[i];
        if seen.contains(&n) {
            continue;
        }
        seen.push(n);
        bank.remove(i);
        board[cell] = Some(n);
        count += reference_count(p, board, bank);
        bank.insert(i, n);
        board[cell] = None;
        if count >= 2 {
            break;
        }
    }
    count
}
fn audit(p: &Puzzle) {
    p.validate().unwrap();
    assert!(p.layout.rows <= 11 && p.layout.cols <= 11);
    let solutions = solve(p, 2);
    assert_eq!(solutions.len(), 1, "{}", p.id);
    let trace = proof(p).unwrap();
    assert_eq!(trace.len(), p.bank.len());
    let mut board = p.givens.clone();
    let mut bank = p.bank.clone();
    for step in trace {
        let eq = &p.equations[step.equation];
        assert_eq!(eq.cells.map(|i| board[i]), step.before);
        assert_eq!(step.before.iter().filter(|v| v.is_none()).count(), 1);
        assert!(board[step.cell].is_none());
        let mut candidates = std::collections::BTreeSet::new();
        for &n in &bank {
            board[step.cell] = Some(n);
            if relation(eq, &board) == Some(true) {
                candidates.insert(n);
            }
        }
        assert_eq!(candidates, std::collections::BTreeSet::from([step.value]));
        board[step.cell] = None;
        let h = hint(p, &board).unwrap();
        assert_eq!((h.cell, h.value), (step.cell, step.value));
        assert!(h.clear_cell.is_none());
        assert!(h.explanation.contains('='));
        board[step.cell] = Some(step.value);
        bank.remove(bank.iter().position(|&n| n == step.value).unwrap());
    }
    assert!(bank.is_empty());
    assert!(check(p, &board).valid);
    assert!(
        p.equations
            .iter()
            .all(|eq| relation(eq, &board) == Some(true))
    );
    assert_eq!(
        board.iter().map(|n| n.unwrap()).collect::<Vec<_>>(),
        solutions[0]
    );
    assert_eq!(
        reference_count(p, &mut p.givens.clone(), &mut p.bank.clone()),
        1,
        "{}",
        p.id
    );
}
#[test]
fn varied_crosswords_have_one_solution_and_a_replayable_arithmetic_proof() {
    let mut shapes = std::collections::BTreeSet::new();
    for difficulty in ["easy", "medium", "hard"] {
        for seed in 0..96 {
            let p = generate(seed, difficulty).unwrap();
            audit(&p);
            assert_eq!(
                serde_json::to_string(&p).unwrap(),
                serde_json::to_string(&generate(seed, difficulty).unwrap()).unwrap()
            );
            assert!(p.equations.len() >= 10);
            assert!(p.givens.len() > 9);
            shapes.insert(serde_json::to_string(&p.layout).unwrap());
        }
    }
    assert!(shapes.len() > 100);
}
#[test]
fn every_bundled_crossword_is_independently_audited() {
    let catalog: Vec<Puzzle> =
        serde_json::from_str(include_str!("../../../src/data/puzzles.json")).unwrap();
    assert_eq!(catalog.len(), 36);
    for p in catalog {
        audit(&p);
        assert_eq!(
            serde_json::to_string(&p).unwrap(),
            serde_json::to_string(&generate(p.seed, &p.difficulty).unwrap()).unwrap()
        );
    }
}

#[test]
fn original_crossmath_tasks_match_the_authors_answers_and_unchanged_clues() {
    let data: serde_json::Value =
        serde_json::from_str(include_str!("../../../src/data/crossmath-originals.json")).unwrap();
    let records = data["records"].as_array().unwrap();
    assert_eq!(records.len(), 32);
    for record in records {
        let p: Puzzle = serde_json::from_value(record["puzzle"].clone()).unwrap();
        audit(&p);
        let expected: Vec<i32> = serde_json::from_value(record["solution"].clone()).unwrap();
        assert_eq!(solve(&p, 2), vec![expected.clone()]);
        let parse_grid = |key: &str| -> Vec<Vec<String>> {
            record["original"][key]
                .as_str()
                .unwrap()
                .lines()
                .map(|line| {
                    line.split('|')
                        .skip(1)
                        .take(p.layout.cols)
                        .map(|v| v.trim().to_owned())
                        .collect()
                })
                .collect()
        };
        let table = parse_grid("markdown_table");
        let answers = parse_grid("markdown_answer");
        assert_eq!(table.len(), p.layout.rows);
        for (i, pos) in p.layout.cells.iter().enumerate() {
            if table[pos.row][pos.col] == "?" {
                assert!(p.givens[i].is_none());
                assert_eq!(
                    answers[pos.row][pos.col].parse::<i32>().unwrap(),
                    expected[i]
                );
            } else {
                assert_eq!(p.givens[i], Some(table[pos.row][pos.col].parse().unwrap()));
            }
        }
        for eq in &p.equations {
            let [a, b] = eq.cells[..2].try_into().unwrap();
            let start = p.layout.cells[a];
            let next = p.layout.cells[b];
            let vertical = start.col == next.col;
            let symbol =
                &table[start.row + usize::from(vertical)][start.col + usize::from(!vertical)];
            assert_eq!(
                symbol.as_str(),
                match eq.operator {
                    Op::Add => "+",
                    Op::Sub => "-",
                    Op::Mul => "×",
                    Op::Div => "÷",
                }
            );
        }
    }
}
#[test]
fn ambiguous_or_corrupt_external_tasks_fail_verification() {
    let p: Puzzle=serde_json::from_str(r#"{"id":"ambiguous","version":2,"seed":0,"difficulty":"easy","givens":[null,null,5,1,6],"bank":[2,3],"equations":[{"cells":[0,1,2],"operator":"+"},{"cells":[2,3,4],"operator":"+"}],"layout":{"rows":5,"cols":5,"cells":[{"row":0,"col":0},{"row":0,"col":2},{"row":0,"col":4},{"row":2,"col":4},{"row":4,"col":4}]},"rating":{"deductions":0,"rounds":0,"branches":0}}"#).unwrap();
    p.validate().unwrap();
    assert_eq!(solve(&p, 2).len(), 2);
    assert!(proof(&p).is_none());
    assert!(cross_math_core::verify_json(&serde_json::to_string(&p).unwrap()).is_err());
    assert!(!check(&p, &[None]).valid);
    assert!(hint(&p, &[None]).is_err());
    let mut invalid = p.clone();
    invalid.layout.cells[0] = invalid.layout.cells[1];
    assert!(invalid.validate().is_err());
    invalid = p.clone();
    invalid.equations[0].cells[0] = 99;
    assert!(invalid.validate().is_err());
    invalid = p.clone();
    invalid.bank[0] = 99;
    assert!(proof(&invalid).is_none());
    assert!(generate(0, "bogus").is_err());
}
#[test]
fn hints_correct_errors_and_preserve_duplicate_inventory() {
    for seed in 0..32 {
        let p = generate(seed, "hard").unwrap();
        let solution = solve(&p, 1).remove(0);
        let cells: Vec<_> = (0..p.givens.len())
            .filter(|&i| p.givens[i].is_none())
            .collect();
        let a = cells[0];
        let Some(&b) = cells.iter().find(|&&i| solution[i] != solution[a]) else {
            continue;
        };
        let mut board: Vec<_> = solution.iter().copied().map(Some).collect();
        board.swap(a, b);
        for _ in 0..p.bank.len() + 2 {
            if check(&p, &board).valid {
                break;
            }
            let h = hint(&p, &board).unwrap();
            board[h.cell] = Some(h.value);
            if let Some(cell) = h.clear_cell {
                board[cell] = None;
            }
            assert!(check(&p, &board).inventory_valid);
        }
        assert!(check(&p, &board).valid);
    }
}
