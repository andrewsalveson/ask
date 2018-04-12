<?php include('vendor/autoload.php'); // won't include it again in the following examples

use NlpTools\FeatureFactories\FunctionFeatures;
use NlpTools\Tokenizers\WhitespaceTokenizer;
use NlpTools\Documents\Document;
use NlpTools\Documents\WordDocument;
// Define your features
$feats = new FunctionFeatures();
$feats->add(function ($class,WordDocument $d) {
    // this feature is the presence of the word
    return current($d->getDocumentData());
});
$feats->add(function ($class,WordDocument $d) {
    // this feature is the function 'is the word capitalized?'
    $w = current($d->getDocumentData());
    if (ctype_upper($w[0]))
        return "isCapitalized";
});
 
// tokenize the data and create documents
$text = "Please allow me to introduce myself
        I'm a man of wealth and taste";
 
$tokenizer = new WhitespaceTokenizer();
$tokens = $tokenizer->tokenize($text);
$documents = array();
foreach ($tokens as $index=>$token)
{
    $documents[$index] = new WordDocument($tokens,$index,5);
}
 
// print the features that fired for each document given the class '0'
echo implode(
    PHP_EOL,
    array_map(
        function ($d) use($feats) {
            return '['.implode(
                ',',
                $feats->getFeatureArray('0',$d)
            ).']';
        },
        $documents
    )
);
 
// print the features with their frequencies
$feats->modelFrequency();
print_r(
    $feats->getFeatureArray('0', $d)
);