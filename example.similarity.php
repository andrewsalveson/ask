<?php include ('vendor/autoload.php');
 
use \NlpTools\Tokenizers\WhitespaceTokenizer;
use \NlpTools\Similarity\JaccardIndex;
use \NlpTools\Similarity\CosineSimilarity;
use \NlpTools\Similarity\Simhash;
 
$s1 = "Hello, I love you, eon't you tell me your name
        Hello, I love you, let me jump in your game";
$s2 = "Hello, I love you, won't you tell me your name
        Hello, I love you, let me jump in your game";
$s3 = "Hello, I l3ve you, won5t you tellqme your name
        Hello, I lovs yoy7 let mdrtusp in your game";
 
$tok = new WhitespaceTokenizer();
$J = new JaccardIndex();
$cos = new CosineSimilarity();
$simhash = new Simhash(16); // 16 bits hash
 
$setA = $tok->tokenize($s1);
$setB = $tok->tokenize($s2);
$setC = $tok->tokenize($s3);

 
printf (
    "
    Jaccard:  %.3f
    Cosine:   %.3f
    Simhash:  %.3f
    SimhashA: %s
    SimhashB: %s
    ",
    $J->similarity(
        $setA,
        $setB
    ),
    $cos->similarity(
        $setA,
        $setB
    ),
    $simhash->similarity(
        $setA,
        $setB
    ),
    $simhash->simhash($setA),
    $simhash->simhash($setB)
);
 
printf (
    "
    Jaccard:  %.3f
    Cosine:   %.3f
    Simhash:  %.3f
    SimhashA: %s
    SimhashB: %s
    ",
    $J->similarity(
        $setC,
        $setB
    ),
    $cos->similarity(
        $setC,
        $setB
    ),
    $simhash->similarity(
        $setC,
        $setB
    ),
    $simhash->simhash($setC),
    $simhash->simhash($setB)
);