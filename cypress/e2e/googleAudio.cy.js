describe('Sound Prediction Container', () => {
  beforeEach(() => {
    // Visit the page containing the component
    cy.visit('http://localhost:3000/');
  });

  it('displays the correct text', () => {
    // Check if the paragraph text is displayed correctly
    cy.get('[data-test="sound-prediction-container"] p')
      .should('be.visible')
      .and('have.text', 'With a concept of transfer learning. It can also predict your audio activity based on the classes it is trained');
  });

  it('displays the "Start Prediction" button initially', () => {
    // Check if the "Start Prediction" button is initially visible
    cy.get('[data-test="start-prediction-button"]')
      .should('be.visible')
      .and('contain', 'Start Prediction');
  });

  it('Initially label container is empty', () => {
    // Check if the label container is initially empty
    cy.get('#label-container').should('be.empty');
  });

  it('toggles between "Start Prediction" and "Stop Prediction" buttons', () => {
    // Click the "Start Prediction" button
    cy.get('[data-test="start-prediction-button"]').click();

    // Check if the button text changes to "Stop Prediction"
    cy.get('[data-test="stop-prediction-button"]')
      .should('be.visible')
      .and('contain', 'Stop Predictions');

    // Click the "Stop Prediction" button
    cy.get('[data-test="stop-prediction-button"]').click();

    // Check if the button text changes back to "Start Prediction"
    cy.get('[data-test="start-prediction-button"]')
      .should('be.visible')
      .and('contain', 'Start Prediction');
  });

  it('Label container displays predictions on button click', () => {
    // Click the "Start Prediction" button
    cy.get('[data-test="start-prediction-button"]').click();

    // Check if the label container is not empty
    cy.get('#label-container').should('not.be.empty');

    // Check if each child div contains the text of the prediction
    cy.get('#label-container div').should('have.length', 5).each(($div) => {
      cy.wrap($div).should('not.be.empty');
    });


  });
});
