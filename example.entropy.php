<?php include('vendor/autoload.php');
 
use NlpTools\Tokenizers\WhitespaceTokenizer;
use NlpTools\Documents\WordDocument;
use NlpTools\Documents\Document;
use NlpTools\Documents\TrainingSet;
use NlpTools\Models\Maxent;
use NlpTools\Optimizers\MaxentGradientDescent;
use NlpTools\FeatureFactories\FunctionFeatures;

/**
 * Class casting
 *
 * @param string|object $destination
 * @param object $sourceObject
 * @return object
 */
function cast($destination, $sourceObject)
{
    if (is_string($destination)) {
        $destination = new $destination();
    }
    $sourceReflection = new ReflectionObject($sourceObject);
    $destinationReflection = new ReflectionObject($destination);
    $sourceProperties = $sourceReflection->getProperties();
    foreach ($sourceProperties as $sourceProperty) {
        $sourceProperty->setAccessible(true);
        $name = $sourceProperty->getName();
        $value = $sourceProperty->getValue($sourceObject);
        if ($destinationReflection->hasProperty($name)) {
            $propDest = $destinationReflection->getProperty($name);
            $propDest->setAccessible(true);
            $propDest->setValue($destination,$value);
        } else {
            $destination->$name = $value;
        }
    }
    return $destination;
}


$s = "When the objects of an inquiry, in any department, have principles, conditions, or elements, it is through acquaintance with these that knowledge, that is to say scientific knowledge, is attained.
    For we do not think that we know a thing until we are acquainted with its primary conditions or first principles, and have carried our analysis as far as its simplest elements.
    Plainly therefore in the science of Nature, as in other branches of study, our first task will be to try to determine what relates to its principles.";
 
// tokens 0,30,62 are the start of a new sentence
// the rest will be said to have the class other
 
$tok = new WhitespaceTokenizer();
$tokens = $tok->tokenize($s);
 
$tset = new TrainingSet();
array_walk(
    $tokens,
    function ($t,$i) use($tset,$tokens) {
        if (!in_array($i,array(0,30,62))) {
            $tset->addDocument(
                'other',
                new WordDocument($tokens,$i,1) // get word and the previous/next
            );
        } else {
            $tset->addDocument(
                'sentence',
                new WordDocument($tokens,$i,1) // get word and the previous/next
            );
        }
    }
);
 
// Remember that in maxent a feature should also target the class
// thus we prepend each feature name with the class name
$ff = new FunctionFeatures(
    array(
        function ($class, NlpTools\Documents\TrainingDocument $d) {
            // $data[0] is the current word
            // $data[1] is an array of previous words
            // $data[2] is an array of following words
            $data = $d->getDocumentData();
            // check if the previous word ends with '.'
            if (isset($data[1][0])) {
                return (substr($data[1][0],-1)=='.') ? "$class ^ prev_ends_with(.)" : null;
            }
        },
        function ($class, NlpTools\Documents\TrainingDocument $d) {
            $data = $d->getDocumentData();
            // check if this word starts with a capital
            return (ctype_upper($data[0][0])) ? "$class ^ startsUpper" : null;
        },
        function ($class, NlpTools\Documents\TrainingDocument $d) {
            $data = $d->getDocumentData();
            // check if this word is all lowercase
            return (ctype_lower($data[0])) ? "$class ^ isLower" : null;
        }
    )
);
 
// instanciate a gradient descent optimizer for maximum entropy
$optimizer = new MaxentGradientDescent(
    0.001, // Stop if each weight changes less than 0.001
    0.1,   // learning rate
    10     // maximum iterations
);
// an empty maxent model
$maxent = new Maxent(array());
 
// train
$maxent->train($ff,$tset,$optimizer);
 
// show the weights
$maxent->dumpWeights();