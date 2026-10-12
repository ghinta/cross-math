//! Sparse arithmetic crosswords. Every admitted puzzle has a replayable proof.
use crate::Op;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const VERSION: u32 = 2;
type Board = Vec<Option<i32>>;
type Counts = BTreeMap<i32, usize>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub row: usize,
    pub col: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Layout {
    pub rows: usize,
    pub cols: usize,
    pub cells: Vec<Position>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Equation {
    pub cells: [usize; 3],
    pub operator: Op,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Puzzle {
    pub id: String,
    pub version: u32,
    pub seed: u32,
    pub difficulty: String,
    pub givens: Board,
    pub bank: Vec<i32>,
    pub equations: Vec<Equation>,
    pub layout: Layout,
    pub rating: crate::legacy::Rating,
}
fn arithmetic(a: i32, b: i32, op: Op) -> Option<i32> {
    match op {
        Op::Add => a.checked_add(b),
        Op::Sub => a.checked_sub(b),
        Op::Mul => a.checked_mul(b),
        Op::Div if b != 0 && a.checked_rem(b) == Some(0) => a.checked_div(b),
        Op::Div => None,
    }
}
fn symbol(op: Op) -> &'static str {
    match op {
        Op::Add => "+",
        Op::Sub => "−",
        Op::Mul => "×",
        Op::Div => "÷",
    }
}
impl Puzzle {
    pub fn validate(&self) -> Result<(), String> {
        let n = self.givens.len();
        if self.version != VERSION
            || !(5..=36).contains(&n)
            || !(2..=20).contains(&self.equations.len())
            || !["easy", "medium", "hard"].contains(&self.difficulty.as_str())
            || self.id.len() > 100
            || self.id.is_empty()
            || self.layout.cells.len() != n
            || !(5..=21).contains(&self.layout.rows)
            || !(5..=21).contains(&self.layout.cols)
            || self.bank.len() != self.givens.iter().filter(|n| n.is_none()).count()
            || self
                .bank
                .iter()
                .chain(self.givens.iter().flatten())
                .any(|n| !(1..=999).contains(n))
        {
            return Err("Invalid crossword format or inventory".into());
        }
        let mut occupied = BTreeMap::new();
        for (i, p) in self.layout.cells.iter().enumerate() {
            if p.row >= self.layout.rows
                || p.col >= self.layout.cols
                || occupied.insert((p.row, p.col), i).is_some()
            {
                return Err("Invalid cell position".into());
            }
        }
        let mut used = BTreeSet::new();
        let mut axes = BTreeSet::new();
        for eq in &self.equations {
            if eq.cells.iter().any(|&i| i >= n) {
                return Err("Invalid equation index".into());
            }
            let [a, b, c] = eq.cells.map(|i| self.layout.cells[i]);
            let horizontal =
                a.row == b.row && b.row == c.row && a.col + 2 == b.col && b.col + 2 == c.col;
            let vertical =
                a.col == b.col && b.col == c.col && a.row + 2 == b.row && b.row + 2 == c.row;
            if !horizontal && !vertical {
                return Err("Invalid equation geometry".into());
            }
            for cell in eq.cells {
                if !axes.insert((cell, vertical)) {
                    return Err("A cell belongs to two equations in the same direction".into());
                }
            }
            for offset in [1, 3] {
                let pos = (
                    a.row + if vertical { offset } else { 0 },
                    a.col + if horizontal { offset } else { 0 },
                );
                if occupied.insert(pos, n).is_some() {
                    return Err("Overlapping operator".into());
                }
            }
            used.extend(eq.cells);
        }
        if used.len() != n {
            return Err("Unconstrained cell".into());
        }
        // All equations belong to one connected crossword.
        let mut connected = BTreeSet::from([0]);
        loop {
            let old = connected.len();
            for eq in &self.equations {
                if eq.cells.iter().any(|i| connected.contains(i)) {
                    connected.extend(eq.cells);
                }
            }
            if old == connected.len() {
                break;
            }
        }
        if connected.len() != n {
            return Err("Disconnected crossword".into());
        }
        Ok(())
    }
}
fn remaining(p: &Puzzle, board: &[Option<i32>]) -> Option<Counts> {
    if board.len() != p.givens.len() {
        return None;
    }
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
fn equation_valid(eq: &Equation, board: &[Option<i32>]) -> Option<bool> {
    let [a, b, c] = eq.cells.map(|i| board[i]);
    Some(arithmetic(a?, b?, eq.operator) == Some(c?))
}

/// A proof step always uses an equation with exactly one empty cell, checked
/// against the tile inventory. It never derives a hint from a hidden answer.
#[derive(Clone, Debug, Serialize)]
pub struct Deduction {
    pub cell: usize,
    pub value: i32,
    pub equation: usize,
    pub before: [Option<i32>; 3],
    pub explanation: String,
}
fn next_step(p: &Puzzle, board: &[Option<i32>]) -> Option<Deduction> {
    let counts = remaining(p, board)?;
    for (i, eq) in p.equations.iter().enumerate() {
        let before = eq.cells.map(|c| board[c]);
        if before.iter().filter(|v| v.is_none()).count() != 1 {
            continue;
        }
        let slot = before.iter().position(Option::is_none)?;
        let mut candidates =
            counts
                .iter()
                .filter(|(_, count)| **count > 0)
                .filter_map(|(&value, _)| {
                    let mut n = before;
                    n[slot] = Some(value);
                    (arithmetic(n[0]?, n[1]?, eq.operator) == n[2]).then_some(value)
                });
        let Some(value) = candidates.next() else {
            continue;
        };
        if candidates.next().is_some() {
            continue;
        }
        let Position { row, col } = p.layout.cells[eq.cells[slot]];
        let text = before.map(|n| n.map_or("□".into(), |n| n.to_string()));
        let mut complete = before;
        complete[slot] = Some(value);
        let [a, b, c] = complete.map(|n| n.unwrap());
        let explanation = format!(
            "{} {} {} = {}. Setze {} in Zeile {}, Spalte {}: {} {} {} = {}.",
            text[0],
            symbol(eq.operator),
            text[1],
            text[2],
            value,
            row + 1,
            col + 1,
            a,
            symbol(eq.operator),
            b,
            c
        );
        return Some(Deduction {
            cell: eq.cells[slot],
            value,
            equation: i,
            before,
            explanation,
        });
    }
    None
}
pub fn proof(p: &Puzzle) -> Option<Vec<Deduction>> {
    p.validate().ok()?;
    let mut board = p.givens.clone();
    let mut steps = vec![];
    while board.iter().any(Option::is_none) {
        let step = next_step(p, &board)?;
        board[step.cell] = Some(step.value);
        steps.push(step);
    }
    check(p, &board).valid.then_some(steps)
}

// Count solutions independently of the proof strategy: equation tuple support
// and finite inventory, with bounded branching on untrusted imported puzzles.
fn domains(p: &Puzzle, board: &[Option<i32>]) -> Option<Vec<Vec<i32>>> {
    let counts = remaining(p, board)?;
    let available: Vec<_> = counts
        .iter()
        .filter(|(_, c)| **c > 0)
        .map(|(&n, _)| n)
        .collect();
    let mut domains: Vec<Vec<_>> = board
        .iter()
        .map(|n| n.map_or_else(|| available.clone(), |n| vec![n]))
        .collect();
    loop {
        let old = domains.clone();
        for eq in &p.equations {
            let [a, b, c] = eq.cells;
            let mut supported = [BTreeSet::new(), BTreeSet::new(), BTreeSet::new()];
            for &x in &domains[a] {
                for &y in &domains[b] {
                    let Some(z) = arithmetic(x, y, eq.operator) else {
                        continue;
                    };
                    if !domains[c].contains(&z) {
                        continue;
                    }
                    let mut used = Counts::new();
                    for (cell, value) in eq.cells.into_iter().zip([x, y, z]) {
                        if board[cell].is_none() {
                            *used.entry(value).or_default() += 1;
                        }
                    }
                    if used.iter().any(|(v, n)| counts.get(v).unwrap_or(&0) < n) {
                        continue;
                    }
                    for (set, value) in supported.iter_mut().zip([x, y, z]) {
                        set.insert(value);
                    }
                }
            }
            for (j, &cell) in eq.cells.iter().enumerate() {
                domains[cell].retain(|v| supported[j].contains(v));
            }
        }
        for (&n, &count) in &counts {
            let positions: Vec<_> = (0..board.len())
                .filter(|&i| board[i].is_none() && domains[i].contains(&n))
                .collect();
            let forced = positions.iter().filter(|&&i| domains[i].len() == 1).count();
            if positions.len() < count || forced > count {
                return None;
            }
            if count > 0 && positions.len() == count {
                for i in positions {
                    domains[i].retain(|&v| v == n);
                }
            } else if forced == count {
                for i in positions {
                    if domains[i].len() > 1 {
                        domains[i].retain(|&v| v != n);
                    }
                }
            }
        }
        if domains.iter().any(Vec::is_empty) {
            return None;
        }
        if domains == old {
            return Some(domains);
        }
    }
}
fn search(
    p: &Puzzle,
    board: Board,
    limit: usize,
    solutions: &mut Vec<Vec<i32>>,
    budget: &mut usize,
) {
    if solutions.len() >= limit || *budget == 0 {
        return;
    }
    *budget -= 1;
    let Some(domains) = domains(p, &board) else {
        return;
    };
    let next = (0..board.len())
        .filter(|&i| board[i].is_none())
        .min_by_key(|&i| domains[i].len());
    let Some(cell) = next else {
        solutions.push(board.into_iter().map(Option::unwrap).collect());
        return;
    };
    for &n in &domains[cell] {
        let mut next = board.clone();
        next[cell] = Some(n);
        search(p, next, limit, solutions, budget);
    }
}
pub fn solve(p: &Puzzle, limit: usize) -> Vec<Vec<i32>> {
    if p.validate().is_err() {
        return vec![];
    }
    let mut solutions = vec![];
    let mut budget = 10_000;
    search(
        p,
        p.givens.clone(),
        limit.min(2),
        &mut solutions,
        &mut budget,
    );
    // Exhausted search is not proof of uniqueness.
    if budget == 0 { vec![] } else { solutions }
}
#[derive(Serialize, Debug)]
pub struct Check {
    pub equations: Vec<String>,
    pub complete: bool,
    pub valid: bool,
    pub inventory_valid: bool,
}
pub fn check(p: &Puzzle, board: &[Option<i32>]) -> Check {
    let inventory_valid = p.validate().is_ok() && remaining(p, board).is_some();
    let equations: Vec<_> = if board.len() != p.givens.len() || p.validate().is_err() {
        vec!["invalid".into(); p.equations.len()]
    } else {
        p.equations
            .iter()
            .map(|eq| {
                match equation_valid(eq, board) {
                    Some(true) => "valid",
                    Some(false) => "invalid",
                    None => "pending",
                }
                .into()
            })
            .collect()
    };
    let complete = board.len() == p.givens.len() && board.iter().all(Option::is_some);
    let valid = complete && inventory_valid && equations.iter().all(|s| s == "valid");
    Check {
        equations,
        complete,
        valid,
        inventory_valid,
    }
}
#[derive(Serialize, Debug)]
pub struct Hint {
    pub cell: usize,
    pub value: i32,
    pub clear_cell: Option<usize>,
    pub explanation: String,
}
pub fn hint(p: &Puzzle, board: &[Option<i32>]) -> Result<Hint, String> {
    p.validate()?;
    remaining(p, board).ok_or("Invalid number inventory")?;
    let trace = proof(p).ok_or("No verified deduction path")?;
    let mut proven = p.givens.clone();
    for step in &trace {
        proven[step.cell] = Some(step.value);
    }
    for step in trace {
        if board[step.cell] == Some(step.value) {
            continue;
        }
        let mut released = board.to_vec();
        released[step.cell] = None;
        let counts = remaining(p, &released).ok_or("Invalid number inventory")?;
        let clear_cell = if counts.get(&step.value).copied().unwrap_or(0) == 0 {
            (0..board.len()).find(|&j| {
                p.givens[j].is_none() && board[j] == Some(step.value) && proven[j] != board[j]
            })
        } else {
            None
        };
        let mut explanation = step.explanation;
        if board[step.cell].is_some() {
            explanation = format!("Die eingesetzte Zahl passt nicht zum Lösungsweg. {explanation}");
        }
        if let Some(cell) = clear_cell {
            let pos = p.layout.cells[cell];
            explanation.push_str(&format!(
                " Die {} aus Zeile {}, Spalte {} wird zurückgelegt.",
                step.value,
                pos.row + 1,
                pos.col + 1
            ));
        }
        return Ok(Hint {
            cell: step.cell,
            value: step.value,
            clear_cell,
            explanation,
        });
    }
    Err("Puzzle already complete".into())
}

struct Rng(u32);
impl Rng {
    fn pick(&mut self, max: usize) -> usize {
        self.0 = self.0.wrapping_add(0x9e3779b9);
        let mut v = self.0;
        v = (v ^ (v >> 16)).wrapping_mul(0x21f0aaad);
        v = (v ^ (v >> 15)).wrapping_mul(0x735a2d97);
        ((v ^ (v >> 15)) as u64 % max as u64) as usize
    }
    fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.pick(i + 1);
            items.swap(i, j);
        }
    }
}

pub fn generate(seed: u32, difficulty: &str) -> Result<Puzzle, String> {
    let (hidden, range) = match difficulty {
        "easy" => (6, 12),
        "medium" => (9, 25),
        "hard" => (12, 45),
        _ => return Err("Unknown difficulty".into()),
    };
    let mut rng = Rng(seed);
    for _ in 0..250 {
        let mut cells = vec![Position { row: 4, col: 4 }];
        let mut values = vec![(rng.pick(range) + 1) as i32];
        let mut occupied = BTreeSet::from([(4, 4)]);
        let mut axes = BTreeSet::new();
        let mut equations = vec![];
        for _ in 0..15 {
            let mut options = vec![];
            for (anchor, pos) in cells.iter().enumerate() {
                for vertical in [false, true] {
                    if axes.contains(&(anchor, vertical)) {
                        continue;
                    }
                    for slot in 0..3 {
                        let row = pos.row as i32 - if vertical { 2 * slot as i32 } else { 0 };
                        let col = pos.col as i32 - if vertical { 0 } else { 2 * slot as i32 };
                        if row < 0
                            || col < 0
                            || row + if vertical { 4 } else { 0 } > 10
                            || col + if vertical { 0 } else { 4 } > 10
                        {
                            continue;
                        }
                        let positions: Vec<_> = (0..5)
                            .map(|i| {
                                (
                                    row as usize + if vertical { i } else { 0 },
                                    col as usize + if vertical { 0 } else { i },
                                )
                            })
                            .collect();
                        if positions
                            .iter()
                            .enumerate()
                            .all(|(i, p)| i == 2 * slot || !occupied.contains(p))
                        {
                            options.push((anchor, slot, vertical, positions));
                        }
                    }
                }
            }
            rng.shuffle(&mut options);
            let mut added = false;
            for (anchor, slot, vertical, positions) in options {
                let allowed: &[Op] = if difficulty == "easy" {
                    &[Op::Add, Op::Sub]
                } else {
                    &[Op::Add, Op::Sub, Op::Mul, Op::Div]
                };
                let mut triples = vec![];
                for &op in allowed {
                    for a in 1..=99 {
                        for b in 1..=range as i32 {
                            if let Some(c) = arithmetic(a, b, op) {
                                let tuple = [a, b, c];
                                if (1..=99).contains(&c) && tuple[slot] == values[anchor] {
                                    triples.push((op, tuple));
                                }
                            }
                        }
                    }
                }
                if triples.is_empty() {
                    continue;
                }
                let (operator, tuple) = triples[rng.pick(triples.len())];
                let mut indices = [0; 3];
                for j in 0..3 {
                    if j == slot {
                        indices[j] = anchor;
                    } else {
                        indices[j] = cells.len();
                        let (row, col) = positions[2 * j];
                        cells.push(Position { row, col });
                        values.push(tuple[j]);
                    }
                }
                occupied.extend(positions);
                axes.extend(indices.map(|cell| (cell, vertical)));
                equations.push(Equation {
                    cells: indices,
                    operator,
                });
                added = true;
                break;
            }
            if !added {
                break;
            }
        }
        if equations.len() < hidden.max(10)
            || (difficulty != "easy"
                && !equations
                    .iter()
                    .any(|e| matches!(e.operator, Op::Mul | Op::Div)))
        {
            continue;
        }
        let rows = cells.iter().map(|p| p.row).max().unwrap() + 1;
        let cols = cells.iter().map(|p| p.col).max().unwrap() + 1;
        let mut p = Puzzle {
            id: format!("cm2-{difficulty}-{seed:08x}"),
            version: VERSION,
            seed,
            difficulty: difficulty.into(),
            givens: values.into_iter().map(Some).collect(),
            bank: vec![],
            equations,
            layout: Layout { rows, cols, cells },
            rating: crate::legacy::Rating {
                deductions: 0,
                rounds: 0,
                branches: 0,
            },
        };
        let mut order: Vec<_> = (0..p.givens.len()).collect();
        rng.shuffle(&mut order);
        for cell in order {
            let value = p.givens[cell].take().unwrap();
            p.bank.push(value);
            if proof(&p).is_none() {
                p.givens[cell] = Some(value);
                p.bank.pop();
            }
            if p.bank.len() == hidden {
                break;
            }
        }
        if p.bank.len() != hidden || solve(&p, 2).len() != 1 {
            continue;
        }
        let steps = proof(&p).unwrap();
        p.rating.deductions = steps.len();
        // Rounds are simultaneous one-unknown passes, useful for assessing depth.
        let mut board = p.givens.clone();
        while board.iter().any(Option::is_none) {
            let mut next = board.clone();
            for eq in &p.equations {
                let mut one = p.clone();
                one.equations = vec![eq.clone()];
                if let Some(step) = next_step(&one, &board) {
                    next[step.cell] = Some(step.value);
                }
            }
            if next == board {
                return Err("Invalid deduction rating".into());
            }
            board = next;
            p.rating.rounds += 1;
        }
        p.bank.sort_unstable();
        return Ok(p);
    }
    Err("Could not generate a verified crossword within the attempt budget".into())
}
