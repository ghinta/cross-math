use cross_math_core::{Op, Puzzle, check, evaluate, generate, hint, solve};

#[test]
fn arithmetic_handles_precedence_exact_division_and_overflow() {
    assert_eq!(evaluate([2, 3, 4], [Op::Add, Op::Mul]), Some(14));
    assert_eq!(evaluate([20, 5, 2], [Op::Div, Op::Mul]), Some(8));
    assert_eq!(evaluate([20, 5, 2], [Op::Sub, Op::Add]), Some(17));
    assert_eq!(evaluate([9, 2, 3], [Op::Div, Op::Add]), None);
    assert_eq!(evaluate([9, 0, 3], [Op::Div, Op::Add]), None);
    assert_eq!(evaluate([i32::MAX, 2, 1], [Op::Mul, Op::Add]), None);
}

// Independent exhaustive permutation reference: no shared solver/pruning logic.
fn reference_solutions(p: &Puzzle) -> usize {
    fn enumerate(p: &Puzzle, board: &mut [Option<i32>; 9], pool: &mut Vec<i32>) -> usize {
        let Some(cell) = board.iter().position(Option::is_none) else {
            return usize::from(p.equations.iter().all(|e| {
                let [a, b, c] = e.cells.map(|i| board[i].unwrap() as i64);
                use Op::*;
                let apply = |x: i64, y: i64, op: Op| -> Option<i64> {
                    match op {
                        Add => Some(x + y),
                        Sub => Some(x - y),
                        Mul => Some(x * y),
                        Div if y != 0 && x % y == 0 => Some(x / y),
                        Div => None,
                    }
                };
                let [first, second] = e.operators;
                let n = if matches!(first, Add | Sub) && matches!(second, Mul | Div) {
                    apply(b, c, second).and_then(|n| apply(a, n, first))
                } else {
                    apply(a, b, first).and_then(|n| apply(n, c, second))
                };
                n == Some(e.target as i64)
            }));
        };
        let mut total = 0;
        let mut seen = vec![];
        for i in 0..pool.len() {
            let value = pool[i];
            if seen.contains(&value) {
                continue;
            }
            seen.push(value);
            pool.remove(i);
            board[cell] = Some(value);
            total += enumerate(p, board, pool);
            board[cell] = None;
            pool.insert(i, value);
            if total > 1 {
                return total;
            }
        }
        total
    }
    let mut board = p.givens;
    enumerate(p, &mut board, &mut p.bank.clone())
}

#[test]
fn generated_puzzles_are_unique_reproducible_and_deducible() {
    for difficulty in ["easy", "medium", "hard"] {
        for seed in 0..48 {
            let p = generate(seed, difficulty).unwrap();
            assert_eq!(
                serde_json::to_string(&p).unwrap(),
                serde_json::to_string(&generate(seed, difficulty).unwrap()).unwrap()
            );
            let solutions = solve(&p, 2);
            assert_eq!(solutions.len(), 1, "{}", p.id);
            assert!(check(&p, &solutions[0].map(Some)).valid);
            assert_eq!(p.rating.deductions, p.bank.len());
            if seed < 8 {
                assert_eq!(reference_solutions(&p), 1, "{}", p.id);
            }
            let mut board = p.givens;
            for _ in 0..p.bank.len() {
                let h = hint(&p, &board).unwrap();
                assert!(board[h.cell].is_none());
                board[h.cell] = Some(h.value);
            }
            assert!(check(&p, &board).valid);
        }
    }
}

#[test]
fn validation_rejects_corrupt_boards_and_puzzles() {
    let mut p = generate(42, "easy").unwrap();
    let solution = solve(&p, 1)[0];
    let mut board = solution.map(Some);
    let cell = p.givens.iter().position(Option::is_some).unwrap();
    board[cell] = Some(99);
    assert!(!check(&p, &board).valid);
    assert!(!check(&p, &board).inventory_valid);
    p.equations[0].cells[0] = 99;
    assert!(p.validate().is_err());
    assert!(solve(&p, 2).is_empty());
    assert!(generate(42, "unknown").is_err());
}

#[test]
fn duplicate_tiles_do_not_create_false_alternate_solutions() {
    let p = (0..1000)
        .map(|seed| generate(seed, "easy").unwrap())
        .find(|p| p.bank.windows(2).any(|w| w[0] == w[1]))
        .unwrap();
    assert_eq!(solve(&p, 2).len(), 1);
    assert_eq!(reference_solutions(&p), 1);
}

#[test]
fn hints_repair_swapped_numbers_without_duplicating_tiles() {
    let p = generate(100, "medium").unwrap();
    let solution = solve(&p, 1)[0];
    let cells: Vec<usize> = (0..9).filter(|&i| p.givens[i].is_none()).collect();
    let a = cells[0];
    let b = *cells.iter().find(|&&i| solution[i] != solution[a]).unwrap();
    let mut board = solution.map(Some);
    board.swap(a, b);
    let h = hint(&p, &board).unwrap();
    board[h.cell] = Some(h.value);
    if let Some(cell) = h.clear_cell {
        board[cell] = None;
    }
    assert!(check(&p, &board).inventory_valid);
    assert!(h.clear_cell.is_some());
}
