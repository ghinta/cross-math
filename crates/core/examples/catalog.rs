fn main() {
    let mut puzzles = vec![];
    for difficulty in ["easy", "medium", "hard"] {
        for seed in 100..112 {
            puzzles.push(cross_math_core::generate(seed, difficulty).unwrap());
        }
    }
    println!("{}", serde_json::to_string_pretty(&puzzles).unwrap());
}
