//! Platform-independent arithmetic, generation and solving. No I/O or ambient RNG.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const GENERATOR_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Op {
    #[serde(rename = "+")]
    Add,
    #[serde(rename = "-")]
    Sub,
    #[serde(rename = "*")]
    Mul,
    #[serde(rename = "/")]
    Div,
}

impl Op {
    fn high(self) -> bool {
        matches!(self, Self::Mul | Self::Div)
    }
    fn apply(self, a: i32, b: i32) -> Option<i32> {
        match self {
            Self::Add => a.checked_add(b),
            Self::Sub => a.checked_sub(b),
            Self::Mul => a.checked_mul(b),
            Self::Div if b != 0 && a.checked_rem(b) == Some(0) => a.checked_div(b),
            Self::Div => None,
        }
    }
}

/// Equal-precedence operations associate left to right. Division is exact.
pub fn evaluate(n: [i32; 3], ops: [Op; 2]) -> Option<i32> {
    if !ops[0].high() && ops[1].high() {
        ops[0].apply(n[0], ops[1].apply(n[1], n[2])?)
    } else {
        ops[1].apply(ops[0].apply(n[0], n[1])?, n[2])
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Equation {
    pub cells: [usize; 3],
    pub operators: [Op; 2],
    pub target: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Rating {
    pub deductions: usize,
    pub rounds: usize,
    pub branches: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Puzzle {
    pub id: String,
    pub version: u32,
    pub seed: u32,
    pub difficulty: String,
    pub givens: [Option<i32>; 9],
    pub bank: Vec<i32>,
    pub equations: Vec<Equation>,
    pub rating: Rating,
}

type Board = [Option<i32>; 9];
type Counts = BTreeMap<i32, usize>;

impl Puzzle {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != GENERATOR_VERSION || self.equations.len() != 6 {
            return Err("Unsupported puzzle format".into());
        }
        if self.bank.len() != self.givens.iter().filter(|n| n.is_none()).count()
            || self.bank.iter().any(|&n| !(1..=99).contains(&n))
            || self
                .givens
                .iter()
                .flatten()
                .any(|&n| !(1..=99).contains(&n))
        {
            return Err("Invalid number inventory".into());
        }
        for (i, equation) in self.equations.iter().enumerate() {
            let expected = if i < 3 {
                [i * 3, i * 3 + 1, i * 3 + 2]
            } else {
                [i - 3, i, i + 3]
            };
            if equation.cells != expected || !(1..=999).contains(&equation.target) {
                return Err("Invalid equation layout".into());
            }
        }
        Ok(())
    }
}

fn remaining(p: &Puzzle, board: &Board) -> Option<Counts> {
    let mut counts = Counts::new();
    for &n in &p.bank {
        *counts.entry(n).or_default() += 1;
    }
    for (i, &n) in board.iter().enumerate() {
        if let Some(given) = p.givens[i] {
            if n != Some(given) {
                return None;
            }
        } else if let Some(n) = n {
            let count = counts.get_mut(&n)?;
            if *count == 0 {
                return None;
            }
            *count -= 1;
        }
    }
    Some(counts)
}

fn tuple_available(cells: [usize; 3], tuple: [i32; 3], board: &Board, counts: &Counts) -> bool {
    let mut used = Counts::new();
    for (cell, n) in cells.into_iter().zip(tuple) {
        if board[cell].is_none() {
            *used.entry(n).or_default() += 1;
        }
    }
    used.iter()
        .all(|(n, count)| counts.get(n).unwrap_or(&0) >= count)
}

/// Arc consistency across equation tuples, plus inventory cardinality.
/// Identical number tiles are counts, never distinct search branches.
fn domains(p: &Puzzle, board: &Board) -> Option<Vec<Vec<i32>>> {
    let counts = remaining(p, board)?;
    let available: Vec<i32> = counts
        .iter()
        .filter(|(_, c)| **c > 0)
        .map(|(&n, _)| n)
        .collect();
    let mut result: Vec<Vec<i32>> = board
        .iter()
        .map(|n| n.map_or_else(|| available.clone(), |n| vec![n]))
        .collect();
    loop {
        let before = result.clone();
        for eq in &p.equations {
            let [a, b, c] = eq.cells;
            let mut supported = [Vec::new(), Vec::new(), Vec::new()];
            for &x in &result[a] {
                for &y in &result[b] {
                    for &z in &result[c] {
                        let tuple = [x, y, z];
                        if evaluate(tuple, eq.operators) == Some(eq.target)
                            && tuple_available(eq.cells, tuple, board, &counts)
                        {
                            for (j, &v) in tuple.iter().enumerate() {
                                if !supported[j].contains(&v) {
                                    supported[j].push(v);
                                }
                            }
                        }
                    }
                }
            }
            for (j, &cell) in eq.cells.iter().enumerate() {
                result[cell].retain(|v| supported[j].contains(v));
                if result[cell].is_empty() {
                    return None;
                }
            }
        }
        for (&n, &count) in &counts {
            if count == 0 {
                continue;
            }
            let positions: Vec<usize> = (0..9)
                .filter(|&i| board[i].is_none() && result[i].contains(&n))
                .collect();
            let forced = positions.iter().filter(|&&i| result[i].len() == 1).count();
            if positions.len() < count || forced > count {
                return None;
            }
            if positions.len() == count {
                for i in positions {
                    result[i].retain(|&v| v == n);
                }
            } else if forced == count {
                for i in positions {
                    if result[i].len() > 1 {
                        result[i].retain(|&v| v != n);
                    }
                }
            }
        }
        if result.iter().any(Vec::is_empty) {
            return None;
        }
        if before == result {
            return Some(result);
        }
    }
}

fn search(
    p: &Puzzle,
    board: Board,
    solutions: &mut Vec<[i32; 9]>,
    limit: usize,
    branches: &mut usize,
) {
    if solutions.len() >= limit {
        return;
    }
    let Some(candidates) = domains(p, &board) else {
        return;
    };
    let next = (0..9)
        .filter(|&i| board[i].is_none())
        .min_by_key(|&i| candidates[i].len());
    let Some(cell) = next else {
        solutions.push(board.map(|n| n.unwrap()));
        return;
    };
    if candidates[cell].len() > 1 {
        *branches += 1;
    }
    for &n in &candidates[cell] {
        let mut assigned = board;
        assigned[cell] = Some(n);
        search(p, assigned, solutions, limit, branches);
        if solutions.len() >= limit {
            return;
        }
    }
}

pub fn solve(p: &Puzzle, limit: usize) -> Vec<[i32; 9]> {
    if p.validate().is_err() {
        return vec![];
    }
    let mut solutions = vec![];
    search(p, p.givens, &mut solutions, limit.min(2), &mut 0);
    solutions
}

fn rate(p: &Puzzle) -> Rating {
    let mut board = p.givens;
    let mut deductions = 0;
    let mut rounds = 0;
    while let Some(candidates) = domains(p, &board) {
        let mut progress = false;
        for i in 0..9 {
            if board[i].is_none() && candidates[i].len() == 1 {
                board[i] = Some(candidates[i][0]);
                deductions += 1;
                progress = true;
            }
        }
        if !progress {
            break;
        }
        rounds += 1;
    }
    let mut branches = 0;
    search(p, p.givens, &mut vec![], 2, &mut branches);
    Rating {
        deductions,
        rounds,
        branches,
    }
}

struct Rng(u32);
impl Rng {
    fn next(&mut self) -> u32 {
        // Fixed, explicitly wrapping PRNG, identical on native and wasm32.
        self.0 = self.0.wrapping_add(0x9e3779b9);
        let mut v = self.0;
        v = (v ^ (v >> 16)).wrapping_mul(0x21f0aaad);
        v = (v ^ (v >> 15)).wrapping_mul(0x735a2d97);
        v ^ (v >> 15)
    }
    fn pick(&mut self, max: usize) -> usize {
        (self.next() as u64 % max as u64) as usize
    }
    fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.pick(i + 1);
            items.swap(i, j);
        }
    }
}

pub fn generate(seed: u32, difficulty: &str) -> Result<Puzzle, String> {
    let (max, hidden, allowed): (usize, usize, &[Op]) = match difficulty {
        "easy" => (12, 4, &[Op::Add, Op::Sub]),
        "medium" => (20, 6, &[Op::Add, Op::Sub, Op::Mul, Op::Div]),
        "hard" => (30, 8, &[Op::Add, Op::Sub, Op::Mul, Op::Div]),
        _ => return Err("Unknown difficulty".into()),
    };
    let mut rng = Rng(seed);
    for _ in 0..300 {
        let solution: [i32; 9] = std::array::from_fn(|_| (rng.pick(max) + 1) as i32);
        let mut equations = vec![];
        for i in 0..6 {
            let cells = if i < 3 {
                [i * 3, i * 3 + 1, i * 3 + 2]
            } else {
                [i - 3, i, i + 3]
            };
            let mut pairs: Vec<[Op; 2]> = allowed
                .iter()
                .flat_map(|&a| allowed.iter().map(move |&b| [a, b]))
                .collect();
            rng.shuffle(&mut pairs);
            let numbers = cells.map(|i| solution[i]);
            if let Some((operators, target)) = pairs
                .into_iter()
                .filter_map(|ops| evaluate(numbers, ops).map(|target| (ops, target)))
                .find(|(_, t)| (1..=999).contains(t))
            {
                equations.push(Equation {
                    cells,
                    operators,
                    target,
                });
            }
        }
        if equations.len() != 6
            || (difficulty != "easy"
                && !equations
                    .iter()
                    .any(|e| e.operators.iter().any(|o| o.high())))
        {
            continue;
        }
        let mut order: Vec<usize> = (0..9).collect();
        rng.shuffle(&mut order);
        let mut p = Puzzle {
            id: format!("cm{GENERATOR_VERSION}-{difficulty}-{seed:08x}"),
            version: GENERATOR_VERSION,
            seed,
            difficulty: difficulty.into(),
            givens: solution.map(Some),
            bank: vec![],
            equations,
            rating: Rating {
                deductions: 0,
                rounds: 0,
                branches: 0,
            },
        };
        for &cell in &order {
            let n = p.givens[cell].take().unwrap();
            p.bank.push(n);
            if solve(&p, 2).len() != 1 {
                p.givens[cell] = Some(n);
                p.bank.pop();
            }
            if p.bank.len() == hidden {
                break;
            }
        }
        if p.bank.len() != hidden {
            continue;
        }
        p.rating = rate(&p);
        // Launch levels must be solvable by equation/inventory deduction.
        // Number range, operator mix and missing information increase by tier.
        if p.rating.deductions != hidden {
            continue;
        }
        p.bank.sort_unstable();
        return Ok(p);
    }
    Err("Could not generate a quality puzzle within the attempt budget".into())
}

#[derive(Serialize, Debug)]
pub struct Check {
    pub equations: Vec<String>,
    pub complete: bool,
    pub valid: bool,
    pub inventory_valid: bool,
}

pub fn check(p: &Puzzle, board: &Board) -> Check {
    let inventory_valid = remaining(p, board).is_some();
    let equations: Vec<String> = p
        .equations
        .iter()
        .map(|eq| {
            let numbers: Option<Vec<i32>> = eq.cells.iter().map(|&i| board[i]).collect();
            match numbers {
                None => "pending",
                Some(n) if evaluate([n[0], n[1], n[2]], eq.operators) == Some(eq.target) => "valid",
                _ => "invalid",
            }
            .into()
        })
        .collect();
    let complete = board.iter().all(Option::is_some);
    let valid = complete && inventory_valid && equations.iter().all(|status| status == "valid");
    Check {
        equations,
        complete,
        valid,
        inventory_valid,
    }
}

#[derive(Serialize)]
pub struct Hint {
    pub cell: usize,
    pub value: i32,
    pub clear_cell: Option<usize>,
    pub explanation: String,
}

pub fn hint(p: &Puzzle, board: &Board) -> Result<Hint, String> {
    let solution = solve(p, 1).into_iter().next().ok_or("Unsolvable puzzle")?;
    if let Some(i) =
        (0..9).find(|&i| p.givens[i].is_none() && board[i].is_some_and(|n| n != solution[i]))
    {
        let mut released = *board;
        released[i] = None;
        let counts = remaining(p, &released).ok_or("Invalid number inventory")?;
        let clear_cell = if counts.get(&solution[i]).copied().unwrap_or(0) == 0 {
            (0..9).find(|&j| {
                p.givens[j].is_none()
                    && board[j] == Some(solution[i])
                    && board[j] != Some(solution[j])
            })
        } else {
            None
        };
        let move_note = clear_cell
            .map(|j| {
                format!(
                    " Dafür wird die falsch platzierte {} aus Zeile {}, Spalte {} freigegeben.",
                    solution[i],
                    j / 3 + 1,
                    j % 3 + 1
                )
            })
            .unwrap_or_default();
        return Ok(Hint {
            cell: i,
            value: solution[i],
            clear_cell,
            explanation: format!(
                "In Zeile {}, Spalte {} steht eine Zahl, die nicht zur gemeinsamen Lösung passt. Korrigiere sie auf {}.{}",
                i / 3 + 1,
                i % 3 + 1,
                solution[i],
                move_note
            ),
        });
    }
    let candidates = domains(p, board).ok_or("Invalid number inventory")?;
    let i = (0..9)
        .filter(|&i| board[i].is_none())
        .min_by_key(|&i| candidates[i].len())
        .ok_or("Puzzle already complete")?;
    let explanation = if candidates[i].len() == 1 {
        format!(
            "Vergleiche Zeile {} und Spalte {} mit den übrigen Zahlen: Nur {} erfüllt beide Gleichungen und den Zahlenvorrat.",
            i / 3 + 1,
            i % 3 + 1,
            solution[i]
        )
    } else {
        format!(
            "Wenn du die verbleibenden Kombinationen in Zeile {} und Spalte {} weiterverfolgst, passt hier {}.",
            i / 3 + 1,
            i % 3 + 1,
            solution[i]
        )
    };
    Ok(Hint {
        cell: i,
        value: solution[i],
        clear_cell: None,
        explanation,
    })
}

pub fn generate_json(seed: u32, difficulty: &str) -> Result<String, String> {
    serde_json::to_string(&generate(seed, difficulty)?).map_err(|e| e.to_string())
}

pub fn check_json(puzzle: &str, values: &str) -> Result<String, String> {
    let p: Puzzle = serde_json::from_str(puzzle).map_err(|e| e.to_string())?;
    p.validate()?;
    let board: Board = serde_json::from_str(values).map_err(|e| e.to_string())?;
    serde_json::to_string(&check(&p, &board)).map_err(|e| e.to_string())
}

pub fn hint_json(puzzle: &str, values: &str) -> Result<String, String> {
    let p: Puzzle = serde_json::from_str(puzzle).map_err(|e| e.to_string())?;
    p.validate()?;
    let board: Board = serde_json::from_str(values).map_err(|e| e.to_string())?;
    serde_json::to_string(&hint(&p, &board)?).map_err(|e| e.to_string())
}
